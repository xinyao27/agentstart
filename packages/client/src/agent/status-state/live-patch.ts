import { agentProviderSessionsEqual } from '@agentstart/protocol/agent/session-resume'
import { AGENT_STATUS_STALE_AFTER_MS } from '@agentstart/protocol/agent/status-records'
import { isExplicitAgentStatusFresh } from '~renderer/agent/status'

import type { AppState } from '../../store/types'
import type { resolveLiveAgentStatusEntry } from './live-entry'
import { isAgentCompletionState, findAgentPaneWorktreeId } from './retention-model'
import { sleepingRecordFromEntry, recoveryRecordMatches } from './sleeping-model'
import type { AgentStatusSlice } from './slice'
import { pruneMigrationUnsupportedEntries } from './state-model'

type ReadyLiveAgentStatusEntry = Extract<
  ReturnType<typeof resolveLiveAgentStatusEntry>,
  { status: 'ready' }
>

export function buildLiveAgentStatusPatch(input: {
  state: AppState
  paneKey: string
  payload: Parameters<AgentStatusSlice['setAgentStatus']>[1]
  updatedAt: number
  resolution: ReadyLiveAgentStatusEntry
}) {
  const { state: s, paneKey, payload, updatedAt, resolution } = input
  const {
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
  } = resolution
  let completionRefreshWorktreeId: string | null = null
  if (
    isAgentCompletionState(entry.state) &&
    existing !== undefined &&
    !isAgentCompletionState(existing.state)
  ) {
    completionRefreshWorktreeId = entry.worktreeId ?? findAgentPaneWorktreeId(s, paneKey)
  }
  // Why: broad freshness-aware subscribers only need a global tick when
  // an entry appears, changes state, crosses stale->fresh, or receives
  // a same-state `done` update that may carry the final assistant
  // message for retained rows. Same-state working prompt/tool pings
  // still update agentStatusByPaneKey for the owning row, but they must
  // not fan out through dashboard/sidebar aggregate work across every
  // card. Sort-relevant inputs are:
  //   1. `state` transitions — smart-sort class is a function of state.
  //   2. Freshness transitions (stale → fresh) — `resolveAttention` in
  //      smart-attention.ts filters entries through
  //      `isExplicitAgentStatusFresh(entry, now, AGENT_STATUS_STALE_AFTER_MS)`
  //      (30-min TTL). A stale entry that refreshes with the SAME state
  //      goes from "not contributing" (Class 4) to driving a higher
  //      class — order must update. Snapshot hydration can pass an older
  //      updatedAt; in that case the entry is still stored with its true
  //      age, and selectors will immediately decay it if it is already
  //      stale.
  const wasFresh =
    !!existing && isExplicitAgentStatusFresh(existing, updatedAt, AGENT_STATUS_STALE_AFTER_MS)
  // Why attribution is aggregate state: a late main-process stamp can
  // change which workspace remains visible without changing agent state.
  const attributionChanged =
    existing?.worktreeId !== entry.worktreeId || existing?.tabId !== entry.tabId
  // Why: main is authoritative on stateStartedAt and only advances it on a
  // real turn boundary (state transition or a Command Code new turn). If the
  // renderer-local `commandCodeNewTurn` misses it — e.g. a transcript-read
  // failure left `existing.promptInteractionKey` undefined so the key-change
  // is invisible here — main's reset still arrives via `timing.stateStartedAt`.
  // Treat a same-state stateStartedAt advance as sort-relevant so smart sort
  // never goes stale. Non-Command-Code agents never advance stateStartedAt
  // while the state is unchanged, so this stays effectively CC-scoped.
  const sameStateStateStartedAtChanged =
    !!existing &&
    existing.state === payload.state &&
    entry.stateStartedAt !== existing.stateStartedAt
  const sortRelevantChange =
    !existing ||
    existing.state !== payload.state ||
    !wasFresh ||
    attributionChanged ||
    commandCodeNewTurn ||
    sameStateStateStartedAtChanged
  const doneRetentionFieldsChanged =
    existing?.state === 'done' &&
    entry.state === 'done' &&
    (entry.prompt !== existing.prompt ||
      entry.updatedAt !== existing.updatedAt ||
      entry.stateStartedAt !== existing.stateStartedAt ||
      entry.agentType !== existing.agentType ||
      entry.model !== existing.model ||
      entry.terminalTitle !== existing.terminalTitle ||
      entry.toolName !== existing.toolName ||
      entry.toolInput !== existing.toolInput ||
      entry.lastAssistantMessage !== existing.lastAssistantMessage ||
      entry.orchestration !== existing.orchestration ||
      entry.subagents !== existing.subagents ||
      entry.providerSession !== existing.providerSession ||
      entry.interrupted !== existing.interrupted)
  const retentionRelevantChange =
    sortRelevantChange || attributionChanged || doneRetentionFieldsChanged
  // Why: a new status event means the agent is live again — lift any
  // one-shot retention suppressor so the row can be retained normally
  // on its next disappearance. setAgentStatus fires on every PTY status
  // update (high frequency), so only clone retentionSuppressedPaneKeys
  // when there is actually a suppressor to remove — otherwise every
  // status ping would churn that map reference and force spurious
  // re-renders in any subscriber selecting on it.
  const hasSuppressor = paneKey in s.retentionSuppressedPaneKeys
  let nextRetentionSuppressedPaneKeys = s.retentionSuppressedPaneKeys
  if (hasSuppressor) {
    nextRetentionSuppressedPaneKeys = { ...s.retentionSuppressedPaneKeys }
    delete nextRetentionSuppressedPaneKeys[paneKey]
  }
  // Why: pane keys are reused by the same terminal pane across turns.
  // Once a fresh live hook row arrives, any retained snapshot for that
  // pane is stale and must not render beside the live row in the sidebar.
  const hasRetainedSnapshot = paneKey in s.retainedAgentsByPaneKey
  const nextRetainedAgents = hasRetainedSnapshot
    ? { ...s.retainedAgentsByPaneKey }
    : s.retainedAgentsByPaneKey
  if (hasRetainedSnapshot) {
    delete nextRetainedAgents[paneKey]
  }
  const migrationUnsupported = pruneMigrationUnsupportedEntries(
    s.migrationUnsupportedByPtyId,
    (entry) => entry.paneKey === paneKey
  )
  const liveRecoveryWorktreeId =
    entry.state === 'done' && !retainsResumableRecoveryIdentity
      ? null
      : (entry.worktreeId ?? findAgentPaneWorktreeId(s, entry.paneKey))
  const liveRecoveryRecord = liveRecoveryWorktreeId
    ? sleepingRecordFromEntry({
        state: s,
        // Why: a completed resumable turn leaves the TUI alive. Preserve
        // its resume identity without representing done as pending work.
        entry: retainsResumableRecoveryIdentity
          ? { ...entry, state: 'working', prompt: '', lastAssistantMessage: undefined }
          : entry,
        worktreeId: liveRecoveryWorktreeId,
        capturedAt: updatedAt,
        launchConfig: launchConfigSource,
        origin: 'live'
      })
    : null
  let nextSleepingAgentSessions = s.sleepingAgentSessionsByPaneKey
  let nextLaunchConfigs = s.agentLaunchConfigByPaneKey
  if (
    matchedRegistryLaunchConfig &&
    registryEntry &&
    providerSession &&
    !agentProviderSessionsEqual(
      identity.agentType,
      registryEntry.identity.providerSession,
      providerSession
    )
  ) {
    nextLaunchConfigs = {
      ...nextLaunchConfigs,
      [paneKey]: {
        ...registryEntry,
        identity: {
          ...registryEntry.identity,
          providerSession
        }
      }
    }
  }
  // Why: launch tokens can remain in a shell after a AgentStart-started TUI exits;
  // once the original session is done they must no longer authorize config reuse.
  if (
    (providerSessionChanged || entry.state === 'done') &&
    paneKey in s.agentLaunchConfigByPaneKey
  ) {
    nextLaunchConfigs = { ...s.agentLaunchConfigByPaneKey }
    delete nextLaunchConfigs[paneKey]
  }
  if (liveRecoveryRecord) {
    if (!recoveryRecordMatches(existingSleepingRecord, liveRecoveryRecord)) {
      nextSleepingAgentSessions = {
        ...s.sleepingAgentSessionsByPaneKey,
        [paneKey]: liveRecoveryRecord
      }
    }
  } else if (existingSleepingRecord) {
    nextSleepingAgentSessions = { ...s.sleepingAgentSessionsByPaneKey }
    delete nextSleepingAgentSessions[paneKey]
  }
  const patch = {
    agentStatusByPaneKey: { ...s.agentStatusByPaneKey, [paneKey]: entry },
    retainedAgentsByPaneKey: nextRetainedAgents,
    sleepingAgentSessionsByPaneKey: nextSleepingAgentSessions,
    agentLaunchConfigByPaneKey: nextLaunchConfigs,
    migrationUnsupportedByPtyId: migrationUnsupported.next,
    retentionSuppressedPaneKeys: nextRetentionSuppressedPaneKeys,
    agentStatusEpoch:
      retentionRelevantChange || migrationUnsupported.changed
        ? s.agentStatusEpoch + 1
        : s.agentStatusEpoch,
    sortEpoch: sortRelevantChange || migrationUnsupported.changed ? s.sortEpoch + 1 : s.sortEpoch
  }

  return { patch, completionRefreshWorktreeId }
}
