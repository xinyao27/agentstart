import type { SleepingAgentSessionRecord } from '@agentstart/protocol/agent/session-resume'
import type { StateCreator } from 'zustand'
import { isCompletedAgentWithLiveRecoveryRecord } from '~renderer/settings/completed-agent-live-recovery-record'

import type { AppState } from '../../store/types'
import { getLaunchConfigForEntry } from './launch-model'
import {
  paneKeyMatchesAnyTabPrefix,
  findAgentPaneWorktreeId,
  retainedAgentEntryFromLive,
  shouldReplaceRetainedWithLive,
  normalizePaneKeySet
} from './retention-model'
import {
  sleepingRecordFromEntry,
  removeSleepingRecordsReplacedByManualWorktreeSleep,
  collectSleepingAgentSessionRecordsForWorktree,
  sleepingRecordsEquivalentIgnoringCaptureTime,
  recoveryRecordTargetsSameSession
} from './sleeping-model'
import type { RetainedAgentEntry, AgentStatusSlice } from './slice'
import { pruneMigrationUnsupportedEntries } from './state-model'

export function createAgentStatusWorktreeCaptureActions(
  set: Parameters<StateCreator<AppState, [], [], AgentStatusSlice>>[0],
  _get: Parameters<StateCreator<AppState, [], [], AgentStatusSlice>>[1],
  scheduleFreshness: () => void
): Pick<
  AgentStatusSlice,
  | 'dropAgentStatusByWorktree'
  | 'captureSleepingAgentSessionsByWorktree'
  | 'captureAllSleepingAgentSessions'
> {
  return {
    dropAgentStatusByWorktree: (worktreeId, opts) => {
      let hadLive = false
      set((s) => {
        const tabPrefixes = (s.tabsByWorktree[worktreeId] ?? []).map((tab) => `${tab.id}:`)
        const liveEntries = Object.entries(s.agentStatusByPaneKey).filter(
          ([paneKey, entry]) =>
            entry.worktreeId === worktreeId || paneKeyMatchesAnyTabPrefix(paneKey, tabPrefixes)
        )
        const liveKeys = liveEntries.map(([paneKey]) => paneKey)
        const liveKeySet = new Set(liveKeys)
        const launchConfigKeys = Object.keys(s.agentLaunchConfigByPaneKey).filter(
          (paneKey) => paneKeyMatchesAnyTabPrefix(paneKey, tabPrefixes) || liveKeySet.has(paneKey)
        )
        const retainedKeys = Object.entries(s.retainedAgentsByPaneKey)
          .filter(
            ([paneKey, retained]) =>
              retained.worktreeId === worktreeId || paneKeyMatchesAnyTabPrefix(paneKey, tabPrefixes)
          )
          .map(([paneKey]) => paneKey)
        const retainedKeySet = new Set(retainedKeys)
        const migrationUnsupported = pruneMigrationUnsupportedEntries(
          s.migrationUnsupportedByPtyId,
          (entry) =>
            entry.worktreeId === worktreeId ||
            (entry.paneKey ? paneKeyMatchesAnyTabPrefix(entry.paneKey, tabPrefixes) : false)
        )
        const allowedPaneKeys = normalizePaneKeySet(opts?.sleepingPaneKeys)
        const preserveHibernatedEvidence =
          opts?.shutdownReason === 'auto-hibernate-completed-agent' &&
          allowedPaneKeys !== null &&
          allowedPaneKeys.size > 0
        const liveEntryByPaneKey = new Map(liveEntries)
        const retainedEvidence = new Map<string, RetainedAgentEntry>()
        if (preserveHibernatedEvidence) {
          for (const retained of opts?.retainedCompletionEvidence ?? []) {
            if (
              allowedPaneKeys.has(retained.entry.paneKey) &&
              !liveEntryByPaneKey.has(retained.entry.paneKey) &&
              shouldReplaceRetainedWithLive(retainedEvidence.get(retained.entry.paneKey), retained)
            ) {
              retainedEvidence.set(retained.entry.paneKey, retained)
            }
          }
          for (const [paneKey, entry] of liveEntries) {
            const agentType = entry.agentType
            if (
              allowedPaneKeys.has(paneKey) &&
              entry.state === 'done' &&
              agentType !== undefined &&
              entry.interrupted !== true
            ) {
              retainedEvidence.set(
                paneKey,
                retainedAgentEntryFromLive(s, worktreeId, entry, agentType)
              )
            }
          }
        }
        const retainedEvidenceKeys = new Set(retainedEvidence.keys())
        // See removeAgentStatus for rationale on ack cleanup. Current tabs are
        // swept by prefix; attributed live rows and orphan retained rows are
        // swept by their retained/lifecycle key. Auto-hibernated completion
        // evidence keeps its read state so a slept card does not turn bold again.
        let nextAck = s.acknowledgedAgentsByPaneKey
        const ackKeys = Object.keys(nextAck).filter(
          (k) =>
            !retainedEvidenceKeys.has(k) &&
            (paneKeyMatchesAnyTabPrefix(k, tabPrefixes) ||
              liveKeySet.has(k) ||
              retainedKeySet.has(k))
        )
        if (ackKeys.length > 0) {
          nextAck = { ...nextAck }
          for (const key of ackKeys) {
            delete nextAck[key]
          }
        }
        // Mirror dropAgentStatusByTabPrefix: when nothing live or retained
        // changed, narrow the return to just the ack delta (or s) so we don't
        // emit a new top-level state object that re-renders full-state
        // subscribers for nothing.
        if (
          liveKeys.length === 0 &&
          launchConfigKeys.length === 0 &&
          retainedKeys.length === 0 &&
          retainedEvidence.size === 0 &&
          !migrationUnsupported.changed
        ) {
          if (nextAck !== s.acknowledgedAgentsByPaneKey) {
            return { acknowledgedAgentsByPaneKey: nextAck }
          }
          return s
        }
        hadLive = liveKeys.length > 0

        const nextLive =
          liveKeys.length > 0 ? { ...s.agentStatusByPaneKey } : s.agentStatusByPaneKey
        for (const key of liveKeys) {
          delete nextLive[key]
        }
        const nextLaunchConfigs =
          launchConfigKeys.length > 0
            ? { ...s.agentLaunchConfigByPaneKey }
            : s.agentLaunchConfigByPaneKey
        for (const key of launchConfigKeys) {
          delete nextLaunchConfigs[key]
        }

        const nextRetained =
          retainedKeys.length > 0 || retainedEvidence.size > 0
            ? { ...s.retainedAgentsByPaneKey }
            : s.retainedAgentsByPaneKey
        for (const key of retainedKeys) {
          if (!retainedEvidenceKeys.has(key)) {
            delete nextRetained[key]
          }
        }
        for (const [paneKey, retained] of retainedEvidence) {
          if (shouldReplaceRetainedWithLive(nextRetained[paneKey], retained)) {
            nextRetained[paneKey] = retained
          }
        }

        // Why: normal worktree teardown folds the surface, so live rows need
        // suppressors. Auto-hibernated `done` rows become retained evidence
        // immediately, so suppressing those same pane keys would erase them on
        // the next retention sync.
        const suppressorAdds = liveKeys.filter(
          (k) => !retainedEvidenceKeys.has(k) && !(k in s.retentionSuppressedPaneKeys)
        )
        let nextRetentionSuppressedPaneKeys = s.retentionSuppressedPaneKeys
        if (suppressorAdds.length > 0) {
          nextRetentionSuppressedPaneKeys = { ...s.retentionSuppressedPaneKeys }
          for (const key of suppressorAdds) {
            nextRetentionSuppressedPaneKeys[key] = true
          }
        }

        return {
          agentStatusByPaneKey: nextLive,
          agentLaunchConfigByPaneKey: nextLaunchConfigs,
          retainedAgentsByPaneKey: nextRetained,
          migrationUnsupportedByPtyId: migrationUnsupported.next,
          retentionSuppressedPaneKeys: nextRetentionSuppressedPaneKeys,
          ...(nextAck !== s.acknowledgedAgentsByPaneKey
            ? { acknowledgedAgentsByPaneKey: nextAck }
            : {}),
          agentStatusEpoch:
            hadLive || migrationUnsupported.changed ? s.agentStatusEpoch + 1 : s.agentStatusEpoch,
          sortEpoch: hadLive || migrationUnsupported.changed ? s.sortEpoch + 1 : s.sortEpoch
        }
      })
      if (hadLive) {
        queueMicrotask(() => scheduleFreshness())
      }
    },
    captureSleepingAgentSessionsByWorktree: (worktreeId, paneKeys) => {
      set((s) => {
        const records = collectSleepingAgentSessionRecordsForWorktree(s, worktreeId, {
          paneKeys,
          captureMode: 'manual-worktree-sleep'
        })
        const replaced = removeSleepingRecordsReplacedByManualWorktreeSleep(
          s.sleepingAgentSessionsByPaneKey,
          worktreeId,
          paneKeys
        )
        const next: Record<string, SleepingAgentSessionRecord> = { ...replaced.records }
        let changed = replaced.changed

        for (const record of Object.values(records)) {
          if (next[record.paneKey] !== record) {
            next[record.paneKey] = record
            changed = true
          }
        }

        return changed ? { sleepingAgentSessionsByPaneKey: next } : s
      })
    },
    captureAllSleepingAgentSessions: (mode) => {
      // Why: periodic checkpoints and quit flushes both persist live provider
      // identities, but only a confirmed quit may claim quit precedence.
      set((s) => {
        const capturedAt = Date.now()
        const origin = mode === 'quit' ? ('quit' as const) : ('live' as const)
        const next: Record<string, SleepingAgentSessionRecord> = {
          ...s.sleepingAgentSessionsByPaneKey
        }
        let changed = false
        for (const entry of Object.values(s.agentStatusByPaneKey)) {
          if (entry.state === 'done') {
            const existing = next[entry.paneKey]
            if (!isCompletedAgentWithLiveRecoveryRecord(entry, existing)) {
              continue
            }
            if (mode === 'periodic') {
              continue
            }
            const record = { ...existing, capturedAt, origin }
            if (!sleepingRecordsEquivalentIgnoringCaptureTime(existing, record)) {
              next[entry.paneKey] = record
              changed = true
            }
            continue
          }
          const worktreeId = entry.worktreeId ?? findAgentPaneWorktreeId(s, entry.paneKey)
          if (!worktreeId) {
            continue
          }
          const record = sleepingRecordFromEntry({
            state: s,
            entry,
            worktreeId,
            capturedAt,
            launchConfig: getLaunchConfigForEntry(s, entry),
            origin
          })
          const existing = next[entry.paneKey]
          // Why: a periodic timer racing a confirmed close must not downgrade
          // its shutdown snapshot; a new live hook supersedes it elsewhere.
          if (
            mode === 'periodic' &&
            existing?.origin === 'quit' &&
            record &&
            recoveryRecordTargetsSameSession(existing, record)
          ) {
            continue
          }
          if (record && !sleepingRecordsEquivalentIgnoringCaptureTime(existing, record)) {
            next[record.paneKey] = record
            changed = true
          }
        }
        return changed ? { sleepingAgentSessionsByPaneKey: next } : s
      })
    }
  }
}
