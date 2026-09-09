import {
  agentProviderSessionsEqual,
  getAgentResumeArgv,
  isResumableTuiAgent,
  type SleepingAgentLaunchConfig,
  type SleepingAgentSessionRecord
} from '@yiru/protocol/agent/session-resume'
import {
  AGENT_STATUS_STALE_AFTER_MS,
  type AgentStatusEntry
} from '@yiru/protocol/agent/status-records'
import type { TerminalTab } from '@yiru/protocol/workspace/tabs'
import { isExplicitAgentStatusFresh } from '~renderer/agent/status'
import { isCompletedAgentWithLiveRecoveryRecord } from '~renderer/settings/completed-agent-live-recovery-record'
import { readLastTerminalInputAt } from '~renderer/terminal-pane/input-activity-coalescing'

import type { AppState } from '../../store/types'
import { copyLaunchConfig, getLaunchConfigForEntry, launchConfigsEqual } from './launch-model'
import {
  findTabForAgentEntry,
  normalizePaneKeySet,
  paneKeyMatchesAnyTabPrefix,
  retainedAgentEntryFromLive
} from './retention-model'
import type { RetainedAgentEntry } from './slice'

export function sleepingRecordFromEntry(args: {
  state: AppState
  entry: AgentStatusEntry
  worktreeId: string
  tab?: TerminalTab
  capturedAt: number
  launchConfig?: SleepingAgentLaunchConfig
  origin?: SleepingAgentSessionRecord['origin']
}): SleepingAgentSessionRecord | null {
  const agent = args.entry.agentType
  if (!isResumableTuiAgent(agent) || !args.entry.providerSession) {
    return null
  }
  if (
    !getAgentResumeArgv(agent, args.entry.providerSession, args.launchConfig?.ompResumeFilePath)
  ) {
    return null
  }
  const tab = args.tab ?? findTabForAgentEntry(args.state, args.worktreeId, args.entry)
  return {
    paneKey: args.entry.paneKey,
    ...(tab ? { tabId: tab.id } : {}),
    worktreeId: args.worktreeId,
    agent,
    providerSession: args.entry.providerSession,
    prompt: args.entry.prompt,
    state: args.entry.state,
    capturedAt: args.capturedAt,
    updatedAt: args.entry.updatedAt,
    ...((args.entry.terminalTitle ?? tab?.title)
      ? { terminalTitle: (args.entry.terminalTitle ?? tab?.title)! }
      : {}),
    ...(args.entry.lastAssistantMessage
      ? { lastAssistantMessage: args.entry.lastAssistantMessage }
      : {}),
    ...(args.entry.connectionId !== undefined ? { connectionId: args.entry.connectionId } : {}),
    ...(args.launchConfig ? { launchConfig: copyLaunchConfig(args.launchConfig) } : {}),
    ...(args.entry.interrupted ? { interrupted: true } : {}),
    ...(args.origin ? { origin: args.origin } : {})
  }
}

type CollectSleepingAgentSessionRecordsOptions = {
  paneKeys?: readonly string[]
  captureMode?: 'manual-worktree-sleep' | 'completed-agent-hibernation'
}

export function normalizeSleepingAgentSessionCollectOptions(
  options: readonly string[] | CollectSleepingAgentSessionRecordsOptions | undefined
): CollectSleepingAgentSessionRecordsOptions {
  if (!options) {
    return {}
  }
  return Array.isArray(options)
    ? { paneKeys: options }
    : (options as CollectSleepingAgentSessionRecordsOptions)
}

export function isValidManualSleepLiveAgentEntry(
  state: AppState,
  entry: AgentStatusEntry,
  capturedAt: number
): boolean {
  if (entry.interrupted === true || entry.state === 'done') {
    return false
  }
  const lastInputAt = readLastTerminalInputAt(state.lastTerminalInputAtByPaneKey, entry.paneKey)
  if (
    typeof lastInputAt === 'number' &&
    Number.isFinite(lastInputAt) &&
    lastInputAt > entry.updatedAt
  ) {
    return false
  }
  return isExplicitAgentStatusFresh(entry, capturedAt, AGENT_STATUS_STALE_AFTER_MS)
}

export function isValidCompletedAgentHibernationEntry(entry: AgentStatusEntry): boolean {
  return entry.state === 'done' && entry.interrupted !== true
}

export function removeSleepingRecordsReplacedByManualWorktreeSleep(
  records: Record<string, SleepingAgentSessionRecord>,
  worktreeId: string,
  paneKeys?: readonly string[]
): { records: Record<string, SleepingAgentSessionRecord>; changed: boolean } {
  const allowedPaneKeys = paneKeys ? new Set(paneKeys) : null
  let next = records
  let changed = false
  for (const [paneKey, record] of Object.entries(records)) {
    if (record.worktreeId !== worktreeId || (allowedPaneKeys && !allowedPaneKeys.has(paneKey))) {
      continue
    }
    if (next === records) {
      next = { ...records }
    }
    delete next[paneKey]
    changed = true
  }
  return { records: next, changed }
}

export function collectSleepingAgentSessionRecordsForWorktree(
  state: AppState,
  worktreeId: string,
  options?: readonly string[] | CollectSleepingAgentSessionRecordsOptions
): Record<string, SleepingAgentSessionRecord> {
  const capturedAt = Date.now()
  const collectOptions = normalizeSleepingAgentSessionCollectOptions(options)
  const allowedPaneKeys = collectOptions.paneKeys ? new Set(collectOptions.paneKeys) : null
  const isManualWorktreeSleep = collectOptions.captureMode === 'manual-worktree-sleep'
  const isCompletedAgentHibernation = collectOptions.captureMode === 'completed-agent-hibernation'
  const isWorktreeOwnedCapture = isManualWorktreeSleep || isCompletedAgentHibernation
  // Why: hibernated completions are intentional worktree-owned records; wake
  // treats originless completed records as ambiguous legacy captures.
  const origin: SleepingAgentSessionRecord['origin'] | undefined = isWorktreeOwnedCapture
    ? 'worktree-sleep'
    : undefined
  const tabPrefixes = (state.tabsByWorktree[worktreeId] ?? []).map((tab) => `${tab.id}:`)
  const records: Record<string, SleepingAgentSessionRecord> = {}

  if (isManualWorktreeSleep) {
    for (const existing of Object.values(state.sleepingAgentSessionsByPaneKey)) {
      const liveEntry = state.agentStatusByPaneKey[existing.paneKey]
      if (
        existing.worktreeId !== worktreeId ||
        existing.origin !== 'live' ||
        (liveEntry !== undefined && !isCompletedAgentWithLiveRecoveryRecord(liveEntry, existing)) ||
        (allowedPaneKeys && !allowedPaneKeys.has(existing.paneKey)) ||
        !getAgentResumeArgv(
          existing.agent,
          existing.providerSession,
          existing.launchConfig?.ompResumeFilePath
        )
      ) {
        continue
      }
      // Why: a completed resumable TUI remains live at its prompt; manual
      // sleep must promote that checkpoint instead of deleting its identity.
      records[existing.paneKey] = {
        ...existing,
        state: 'working',
        capturedAt,
        updatedAt: capturedAt,
        origin: 'worktree-sleep'
      }
    }
  }

  for (const retained of Object.values(state.retainedAgentsByPaneKey)) {
    if (isCompletedAgentHibernation) {
      continue
    }
    if (allowedPaneKeys && !allowedPaneKeys.has(retained.entry.paneKey)) {
      continue
    }
    if (retained.worktreeId !== worktreeId) {
      continue
    }
    const record = sleepingRecordFromEntry({
      state,
      entry: retained.entry,
      worktreeId,
      tab: retained.tab,
      capturedAt,
      launchConfig: getLaunchConfigForEntry(state, retained.entry),
      origin
    })
    if (record) {
      records[record.paneKey] = record
    }
  }

  for (const [paneKey, entry] of Object.entries(state.agentStatusByPaneKey)) {
    if (allowedPaneKeys && !allowedPaneKeys.has(paneKey)) {
      continue
    }
    const belongsToWorktree =
      entry.worktreeId === worktreeId || paneKeyMatchesAnyTabPrefix(paneKey, tabPrefixes)
    if (!belongsToWorktree) {
      continue
    }
    if (isManualWorktreeSleep && !isValidManualSleepLiveAgentEntry(state, entry, capturedAt)) {
      continue
    }
    if (isCompletedAgentHibernation && !isValidCompletedAgentHibernationEntry(entry)) {
      continue
    }
    const record = sleepingRecordFromEntry({
      state,
      entry,
      worktreeId,
      capturedAt,
      launchConfig: getLaunchConfigForEntry(state, entry),
      origin
    })
    if (record) {
      records[record.paneKey] = record
    }
  }

  return records
}

export function collectHibernatedCompletionEvidenceForWorktree(
  state: AppState,
  worktreeId: string,
  paneKeys?: readonly string[]
): RetainedAgentEntry[] {
  const allowedPaneKeys = normalizePaneKeySet(paneKeys)
  if (!allowedPaneKeys || allowedPaneKeys.size === 0) {
    return []
  }
  const tabPrefixes = (state.tabsByWorktree[worktreeId] ?? []).map((tab) => `${tab.id}:`)
  const retained: RetainedAgentEntry[] = []
  for (const [paneKey, entry] of Object.entries(state.agentStatusByPaneKey)) {
    const agentType = entry.agentType
    if (
      !allowedPaneKeys.has(paneKey) ||
      entry.state !== 'done' ||
      agentType === undefined ||
      entry.interrupted === true
    ) {
      continue
    }
    const belongsToWorktree =
      entry.worktreeId === worktreeId || paneKeyMatchesAnyTabPrefix(paneKey, tabPrefixes)
    if (!belongsToWorktree) {
      continue
    }
    retained.push(retainedAgentEntryFromLive(state, worktreeId, entry, agentType))
  }
  return retained
}

// Why: the periodic resume-record capture re-runs on an interval; comparing
// everything except capturedAt lets an unchanged agent skip the store write
// entirely, so idle ticks never dirty the session persistence pipeline.
export function sleepingRecordsEquivalentIgnoringCaptureTime(
  existing: SleepingAgentSessionRecord | undefined,
  next: SleepingAgentSessionRecord
): boolean {
  if (!existing) {
    return false
  }
  return (
    existing.paneKey === next.paneKey &&
    existing.tabId === next.tabId &&
    existing.worktreeId === next.worktreeId &&
    existing.agent === next.agent &&
    agentProviderSessionsEqual(existing.agent, existing.providerSession, next.providerSession) &&
    existing.prompt === next.prompt &&
    existing.state === next.state &&
    existing.updatedAt === next.updatedAt &&
    existing.terminalTitle === next.terminalTitle &&
    existing.lastAssistantMessage === next.lastAssistantMessage &&
    existing.interrupted === next.interrupted &&
    existing.origin === next.origin &&
    launchConfigsEqual(existing.launchConfig, next.launchConfig)
  )
}

export function recoveryRecordMatches(
  existing: SleepingAgentSessionRecord | undefined,
  next: SleepingAgentSessionRecord
): boolean {
  if (!existing) {
    return false
  }
  return (
    existing.origin === next.origin &&
    existing.agent === next.agent &&
    existing.worktreeId === next.worktreeId &&
    existing.tabId === next.tabId &&
    agentProviderSessionsEqual(existing.agent, existing.providerSession, next.providerSession) &&
    launchConfigsEqual(existing.launchConfig, next.launchConfig)
  )
}

export function recoveryRecordTargetsSameSession(
  existing: SleepingAgentSessionRecord | undefined,
  next: SleepingAgentSessionRecord
): boolean {
  if (!existing) {
    return false
  }
  return (
    existing.agent === next.agent &&
    existing.worktreeId === next.worktreeId &&
    existing.tabId === next.tabId &&
    agentProviderSessionsEqual(existing.agent, existing.providerSession, next.providerSession)
  )
}
