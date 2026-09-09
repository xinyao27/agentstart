import {
  agentProviderSessionsEqual,
  type SleepingAgentSessionRecord
} from '@yiru/protocol/agent/session-resume'
import { parseLegacyNumericPaneKey } from '@yiru/protocol/terminal/pane-identity'
import type { useAppStore } from '~renderer/store/state'

import { getProviderSessionClaimKey } from '../sleeping-agent-pane-ownership'

export type SleepingAgentRecordEntry = {
  paneKey: string
  record: SleepingAgentSessionRecord
}

type SleepingAgentPaneIdentity = {
  paneKey: string
  numericPaneId: number
  tabId: string
  worktreeId: string
}

export function resolveSleepingAgentRecordForPane(
  state: ReturnType<typeof useAppStore.getState>,
  identity: SleepingAgentPaneIdentity
): SleepingAgentRecordEntry | null {
  const stableRecord = state.sleepingAgentSessionsByPaneKey[identity.paneKey]
  if (stableRecord) {
    return { paneKey: identity.paneKey, record: stableRecord }
  }
  const legacyMatches = Object.entries(state.sleepingAgentSessionsByPaneKey).filter(
    ([paneKey, record]) => {
      const legacy = parseLegacyNumericPaneKey(paneKey)
      return (
        legacy?.tabId === identity.tabId &&
        record.worktreeId === identity.worktreeId &&
        (!record.tabId || record.tabId === identity.tabId)
      )
    }
  )
  const exactLegacyMatch = legacyMatches.find(([paneKey]) => {
    const legacy = parseLegacyNumericPaneKey(paneKey)
    return legacy?.numericPaneId === String(identity.numericPaneId)
  })
  const providerSessionKeys = new Set(
    legacyMatches.map(([, record]) => getProviderSessionClaimKey(record))
  )
  const oldestLegacyMatch = legacyMatches
    .slice()
    .sort(([, left], [, right]) =>
      left.capturedAt !== right.capturedAt
        ? left.capturedAt - right.capturedAt
        : left.updatedAt - right.updatedAt
    )[0]
  // Why: duplicate legacy aliases can point at one provider session. Consume
  // the oldest capture as canonical and clear its aliases after resume.
  const selectedLegacyMatch =
    exactLegacyMatch ??
    (providerSessionKeys.size === 1
      ? legacyMatches.length === 1
        ? legacyMatches[0]
        : oldestLegacyMatch
      : null)
  if (!selectedLegacyMatch) {
    return null
  }
  const [paneKey, record] = selectedLegacyMatch
  return { paneKey, record }
}

export function clearSleepingAgentRecordDuplicates(
  state: ReturnType<typeof useAppStore.getState>,
  consumed: SleepingAgentRecordEntry
): void {
  state.clearSleepingAgentSession(consumed.paneKey)
  for (const [paneKey, record] of Object.entries(state.sleepingAgentSessionsByPaneKey)) {
    if (
      paneKey !== consumed.paneKey &&
      record.worktreeId === consumed.record.worktreeId &&
      record.agent === consumed.record.agent &&
      agentProviderSessionsEqual(
        record.agent,
        record.providerSession,
        consumed.record.providerSession
      )
    ) {
      // Why: legacy aliases can leave multiple sleeping rows for one provider
      // session; once this pane resumes it, every alias is stale.
      state.clearSleepingAgentSession(paneKey)
    }
  }
}
