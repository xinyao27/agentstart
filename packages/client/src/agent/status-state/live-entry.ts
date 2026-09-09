import {
  agentProviderSessionsEqual,
  getAgentResumeArgv,
  isResumableTuiAgent
} from '@yiru/protocol/agent/session-resume'
import { agentSubagentsEqual } from '@yiru/protocol/agent/status-parse'
import {
  AGENT_STATE_HISTORY_MAX,
  type AgentStateHistoryEntry,
  type AgentStatusEntry
} from '@yiru/protocol/agent/status-records'

import type { AppState } from '../../store/types'
import { isCommandCodeNewTurnWhileWorking } from './command-code-turn'
import { resolveAgentStatusIdentity, shouldSuppressInheritedTerminalStatus } from './identity'
import { registryEntryMatchesStatus } from './launch-model'
import { getTabIdFromPaneKey, findAgentPaneWorktreeId } from './retention-model'
import type { AgentStatusSlice } from './slice'
import { mergeCurrentOrchestrationContext } from './state-model'

type SetAgentStatusParameters = Parameters<AgentStatusSlice['setAgentStatus']>

export function resolveLiveAgentStatusEntry(input: {
  state: AppState
  paneKey: string
  payload: SetAgentStatusParameters[1]
  terminalTitle: SetAgentStatusParameters[2]
  timing: SetAgentStatusParameters[3]
  routing: SetAgentStatusParameters[4]
  metadata: SetAgentStatusParameters[5]
  updatedAt: number
}) {
  const { state: s, paneKey, payload, terminalTitle, timing, routing, metadata, updatedAt } = input
  const existing = s.agentStatusByPaneKey[paneKey]
  // Why: snapshots and live pushes share receivedAt from the same main-side
  // lastStatusByPaneKey.set, so equal timestamps carry identical data. Strict <
  // preserves live-after-live updates that land in the same millisecond.
  if (existing && updatedAt < existing.updatedAt) {
    return { status: 'ignored' as const }
  }
  // Why: terminalTitle is identity-like — it labels the pane itself, not
  // the current turn's activity. Preserve the prior value when a ping
  // omits it so the pane label does not flicker out between hook events.
  // Unlike the tool/prompt/assistant fields below (which legitimately
  // clear on a fresh turn), a missing title means "no update", not "the
  // pane has no title any more".
  const effectiveTitle = terminalTitle ?? existing?.terminalTitle

  // Why: build up a rolling log of state transitions so the dashboard can
  // render activity blocks showing what the agent has been doing. Only push
  // when the state actually changes to avoid duplicate entries from prompt-
  // only updates within the same state.
  let history: AgentStateHistoryEntry[] = existing?.stateHistory ?? []
  if (existing && existing.state !== payload.state) {
    history = [
      ...history,
      {
        state: existing.state,
        prompt: existing.prompt,
        // Why: use stateStartedAt (not updatedAt) so the history row
        // reflects when the state was first reported, not the most
        // recent within-state ping (tool/prompt updates refresh
        // updatedAt but not stateStartedAt).
        startedAt: existing.stateStartedAt,
        // Why: preserve the interrupt flag on the historical `done` entry
        // so activity-block views can render past cancellations as such.
        interrupted: existing.interrupted
      }
    ]
    if (history.length > AGENT_STATE_HISTORY_MAX) {
      history = history.slice(history.length - AGENT_STATE_HISTORY_MAX)
    }
  }

  const identity = resolveAgentStatusIdentity({
    existing: existing
      ? {
          agentType: existing.agentType,
          state: existing.state,
          updatedAt: existing.updatedAt
        }
      : undefined,
    incoming: payload.agentType,
    now: updatedAt
  })
  // Why: Command Code has no UserPromptSubmit; a fresh transcript prompt while
  // still `working` is the smart-sort turn boundary.
  const commandCodeNewTurn =
    existing !== undefined &&
    isCommandCodeNewTurnWhileWorking({
      agentType: identity.agentType,
      previousState: existing.state,
      incomingState: payload.state,
      previousPrompt: existing.prompt,
      incomingPrompt: payload.prompt,
      previousPromptInteractionKey: existing.promptInteractionKey,
      incomingPromptInteractionKey: payload.promptInteractionKey
    })
  const promptInteractionKey =
    payload.promptInteractionKey ??
    (payload.prompt === existing?.prompt ? existing?.promptInteractionKey : undefined)
  // Why: prefer main's authoritative stateStartedAt when provided — main's
  // attachStatusTiming preserves it across same-state pings (server.ts) and
  // persists it across restart. Fall back to existing.stateStartedAt only when
  // main did not send timing (legacy callers / OSC fallback path), and to
  // updatedAt for a brand-new pane.
  const stateStartedAt =
    timing?.stateStartedAt ??
    (commandCodeNewTurn
      ? updatedAt
      : existing && existing.state === payload.state
        ? existing.stateStartedAt
        : updatedAt)
  if (
    existing &&
    shouldSuppressInheritedTerminalStatus({
      inheritedFromActivePane: identity.inheritedFromActivePane,
      incomingState: payload.state
    })
  ) {
    return { status: 'suppressed' as const }
  }

  // Why: tool/assistant fields come pre-merged from the main-process
  // cache (see `resolveToolState` in server.ts), so the payload always
  // carries the authoritative current snapshot — including clears on a
  // fresh turn. Writing through directly (no existing fallback) is what
  // lets a `UserPromptSubmit` reset clear stale tool lines in the UI.
  const runtimeOrchestration = s.runtimeAgentOrchestrationByPaneKey[paneKey]
  const runtimeMergedOrchestration = runtimeOrchestration
    ? mergeCurrentOrchestrationContext(existing?.orchestration, runtimeOrchestration)
    : undefined
  const payloadMergedOrchestration = payload.orchestration
    ? mergeCurrentOrchestrationContext(
        runtimeMergedOrchestration ?? existing?.orchestration,
        payload.orchestration
      )
    : undefined
  const completedFallbackOrchestration =
    payload.state === 'done' ? existing?.orchestration : undefined
  const orchestration =
    payloadMergedOrchestration ?? runtimeMergedOrchestration ?? completedFallbackOrchestration
  // Why: waiting/blocked remain the same resumable turn; child permission hooks omit the root session id.
  const canReuseExistingProviderSession =
    existing?.agentType === identity.agentType &&
    existing.state !== 'done' &&
    payload.state !== 'done'
  const providerSession =
    metadata?.providerSession ??
    (canReuseExistingProviderSession ? existing.providerSession : undefined)
  const existingProviderSession = canReuseExistingProviderSession
    ? existing.providerSession
    : undefined
  const providerSessionChanged =
    Boolean(metadata?.providerSession && existingProviderSession) &&
    !agentProviderSessionsEqual(
      identity.agentType,
      metadata?.providerSession,
      existingProviderSession
    )
  const statusTabId = routing?.tabId ?? existing?.tabId ?? getTabIdFromPaneKey(paneKey) ?? undefined
  const statusTerminalHandle = routing?.terminalHandle ?? existing?.terminalHandle
  const registryEntry = s.agentLaunchConfigByPaneKey[paneKey]
  const matchedRegistryLaunchConfig = registryEntryMatchesStatus({
    entry: registryEntry,
    paneKey,
    agentType: identity.agentType,
    tabId: statusTabId,
    terminalHandle: statusTerminalHandle,
    launchToken: metadata?.launchToken,
    providerSession,
    existingProviderSession,
    providerSessionChanged
  })
    ? registryEntry?.launchConfig
    : undefined
  const existingSleepingRecord = s.sleepingAgentSessionsByPaneKey[paneKey]
  const retainsResumableRecoveryIdentity =
    payload.state === 'done' &&
    isResumableTuiAgent(identity.agentType) &&
    providerSession !== undefined &&
    getAgentResumeArgv(
      identity.agentType,
      providerSession,
      existingSleepingRecord?.launchConfig?.ompResumeFilePath
    ) !== null
  const matchedSleepingLaunchConfig =
    (payload.state !== 'done' || retainsResumableRecoveryIdentity) &&
    existingSleepingRecord?.launchConfig &&
    existingSleepingRecord.agent === identity.agentType &&
    providerSession &&
    agentProviderSessionsEqual(
      identity.agentType,
      existingSleepingRecord.providerSession,
      providerSession
    )
      ? existingSleepingRecord.launchConfig
      : undefined
  // Why: pane keys can be reused after a manually-started agent replaces
  // a Yiru-launched one. Once the provider session changes, the old
  // pane-key launch registry must not bleed options into the new session.
  const launchConfigSource =
    (payload.state !== 'done' && !providerSessionChanged && metadata?.launchToken
      ? metadata?.launchConfig
      : undefined) ??
    matchedRegistryLaunchConfig ??
    matchedSleepingLaunchConfig
  const entry: AgentStatusEntry = {
    state: payload.state,
    prompt: payload.prompt,
    updatedAt,
    stateStartedAt,
    agentType: identity.agentType,
    model:
      payload.model ?? (existing?.agentType === identity.agentType ? existing.model : undefined),
    paneKey,
    terminalHandle: statusTerminalHandle,
    worktreeId:
      routing?.worktreeId ??
      existing?.worktreeId ??
      findAgentPaneWorktreeId(s, paneKey) ??
      undefined,
    ...(routing?.connectionId !== undefined
      ? { connectionId: routing.connectionId }
      : existing?.connectionId !== undefined
        ? { connectionId: existing.connectionId }
        : {}),
    tabId: statusTabId,
    terminalTitle: effectiveTitle,
    stateHistory: history,
    toolName: payload.toolName,
    toolInput: payload.toolInput,
    // Why: full untruncated AskUserQuestion JSON; carried so mobile/web
    // clients can render the live prompt card. parseAgentStatusPayload
    // already clears it when the agent moves to a different tool/state.
    interactivePrompt: payload.interactivePrompt,
    lastAssistantMessage: payload.lastAssistantMessage,
    // Why: reused panes may start non-orchestrated work after runtime
    // metadata expires. Only final done rows keep the previous lineage
    // fallback so completed children stay grouped.
    orchestration,
    // Why: reuse the previous array reference when the roster is
    // unchanged so subscribers comparing by identity skip re-renders on
    // high-frequency same-roster pings.
    subagents: agentSubagentsEqual(existing?.subagents, payload.subagents)
      ? existing?.subagents
      : payload.subagents,
    ...(providerSession ? { providerSession } : {}),
    ...(promptInteractionKey ? { promptInteractionKey } : {}),
    // Why: interrupted lives on `done` only. parseAgentStatusPayload
    // already clamps it to `undefined` for non-done states, so writing
    // the field through directly preserves truth for done and resets
    // it when a new turn starts (working → Stop reprices it).
    interrupted: payload.interrupted
  }

  return {
    status: 'ready' as const,
    existing,
    entry,
    commandCodeNewTurn,
    existingSleepingRecord,
    retainsResumableRecoveryIdentity,
    matchedRegistryLaunchConfig,
    registryEntry,
    providerSession,
    identity,
    providerSessionChanged,
    launchConfigSource
  }
}
