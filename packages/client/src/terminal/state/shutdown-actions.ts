import { isRuntimePtyId } from '@agentstart/protocol/terminal-identity'
import type { StateCreator } from 'zustand'
import { closeRuntimeTerminal } from '~renderer/runtime/terminal-inspection'
import { disposeParkedTerminalWatchersForPtyIds } from '~renderer/runtime/terminal-parked-watcher-registry'
import { openRuntimeTerminalClient } from '~renderer/runtime/terminal-protocol'
import { shutdownBufferCaptures } from '~renderer/runtime/terminal-shutdown-buffer-captures'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'

import {
  collectHibernatedCompletionEvidenceForWorktree,
  collectSleepingAgentSessionRecordsForWorktree,
  removeSleepingRecordsReplacedByManualWorktreeSleep,
  type AgentStatusWorktreeShutdownReason
} from '../../agent/status-state/slice'
import type { AppState } from '../../store/types'
import { clearTransientTerminalState } from './layout-state'
import { removeTabFromTerminalState, type TerminalState } from './removal'
import {
  resolveTerminalStopRuntimeEnvironmentId,
  sortedUniquePtyIds,
  equalStringSets
} from './runtime-model'
import type { TerminalSlice } from './slice'

export function createTerminalShutdownActions(
  set: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[1]
): Pick<TerminalSlice, 'shutdownWorktreeTerminals'> {
  return {
    shutdownWorktreeTerminals: async (worktreeId, opts) => {
      const keepIdentifiers = opts?.keepIdentifiers ?? false
      const shutdownReason: AgentStatusWorktreeShutdownReason =
        opts?.shutdownReason ?? (keepIdentifiers ? 'manual-sleep' : 'remove-worktree')
      const tabs = get().tabsByWorktree[worktreeId] ?? []
      const ptyIds = tabs.flatMap((tab) => get().ptyIdsByTabId[tab.id] ?? [])
      const rendererShutdownPtyIds = sortedUniquePtyIds(ptyIds)
      const expectedRuntimePtyIds = sortedUniquePtyIds(opts?.expectedRuntimePtyIds)
      const runtimeEnvironmentId = resolveTerminalStopRuntimeEnvironmentId(get(), worktreeId)
      // Why: expectedRuntimePtyIds are raw RPC handles. Only renderer-bound ids
      // can emit pane exit callbacks, so they are the complete guard identity set.
      const exitGuardPtyIds = rendererShutdownPtyIds
      const sleepingAgentSessionRecords = keepIdentifiers
        ? collectSleepingAgentSessionRecordsForWorktree(get(), worktreeId, {
            paneKeys: opts?.sleepingPaneKeys,
            ...(shutdownReason === 'manual-sleep' ? { captureMode: 'manual-worktree-sleep' } : {}),
            ...(shutdownReason === 'auto-hibernate-completed-agent'
              ? { captureMode: 'completed-agent-hibernation' }
              : {})
          })
        : {}
      const retainedCompletionEvidence =
        shutdownReason === 'auto-hibernate-completed-agent'
          ? collectHibernatedCompletionEvidenceForWorktree(
              get(),
              worktreeId,
              opts?.sleepingPaneKeys
            )
          : []

      // Why: the main process flushes any remaining batched PTY data before
      // sending the exit event (pty.ts onExit handler). Without this, that
      // final data burst flows through the still-registered ptyDataHandlers
      // where bell detection and agent-status tracking can fire system
      // notifications for a worktree that is already being torn down —
      // the "phantom alerts" users see after shutting down worktrees.
      // Removing the data handlers first ensures the final flush is a no-op.
      if (expectedRuntimePtyIds.length === 0) {
        // Why: parked-tab byte watchers observe the same flush through dispatcher
        // sidecars, which the call above does not touch — dispose them now or a
        // just-slept/deleted worktree still gets unread marks and delayed
        // bell/completion OS notifications from its teardown bytes.
        disposeParkedTerminalWatchersForPtyIds(rendererShutdownPtyIds)
      }

      // Why (ordering invariant — DESIGN_DOC §3.3.c): on sleep, capture every
      // pane's serializer buffer into terminalLayoutsByTabId[tab].buffersByLeafId
      // BEFORE issuing pty.kill (panes unmount on PTY exit and their
      // serializeAddons go with them) AND BEFORE the set() block below (the
      // capture writes through to the store via its own setTabLayout call; any
      // subsequent set must use a functional updater spreading
      // s.terminalLayoutsByTabId, not a captured snapshot). For SSH this is
      // load-bearing — the relay drops the remote PTY on kill so there's no
      // on-disk history dir to cold-restore from. Local daemon scrollback is
      // intentionally skipped because the session payload prunes it and daemon
      // history/checkpoints are authoritative.
      if (keepIdentifiers) {
        for (const tab of tabs) {
          const capture = shutdownBufferCaptures.get(tab.id)
          if (capture) {
            try {
              capture({ includeLocalBuffers: false })
            } catch {
              // Don't let one tab's capture failure block the rest.
            }
          }
        }
      }

      if (expectedRuntimePtyIds.length > 0) {
        if (!runtimeEnvironmentId) {
          throw new Error('missing_runtime_for_exact_terminal_stop')
        }
        set((s) => ({
          suppressedPtyExitIds: {
            ...s.suppressedPtyExitIds,
            ...Object.fromEntries(exitGuardPtyIds.map((ptyId) => [ptyId, true] as const))
          }
        }))
        let stopResult: {
          stoppedPtyIds?: string[]
          livePtyIds?: string[]
          postStopVerified?: boolean
          postStopFailure?: string
          remainingLivePtyIds?: string[]
        }
        try {
          stopResult = await (
            await openRuntimeTerminalClient({
              kind: 'environment',
              environmentId: runtimeEnvironmentId
            })
          ).stopExact(
            {
              worktree: toRuntimeWorktreeSelector(worktreeId),
              expectedPtyIds: expectedRuntimePtyIds
            },
            { timeoutMs: 15_000 }
          )
        } catch (err) {
          set((s) => {
            const next = { ...s.suppressedPtyExitIds }
            for (const ptyId of exitGuardPtyIds) {
              delete next[ptyId]
            }
            return { suppressedPtyExitIds: next }
          })
          throw err
        }
        const stoppedPtyIds = sortedUniquePtyIds(stopResult.stoppedPtyIds)
        const livePtyIds = sortedUniquePtyIds(stopResult.livePtyIds)
        if (
          !equalStringSets(stoppedPtyIds, expectedRuntimePtyIds) ||
          !equalStringSets(livePtyIds, expectedRuntimePtyIds)
        ) {
          set((s) => {
            const next = { ...s.suppressedPtyExitIds }
            for (const ptyId of exitGuardPtyIds) {
              delete next[ptyId]
            }
            return { suppressedPtyExitIds: next }
          })
          throw new Error('exact_terminal_stop_mismatch')
        }
        if (stopResult.postStopVerified !== true) {
          set((s) => {
            const next = { ...s.suppressedPtyExitIds }
            for (const ptyId of exitGuardPtyIds) {
              delete next[ptyId]
            }
            return { suppressedPtyExitIds: next }
          })
          throw new Error(stopResult.postStopFailure ?? 'exact_terminal_stop_unverified')
        }
      }

      set((s) => {
        let removedTabsState: TerminalState = s
        for (const tab of tabs) {
          removedTabsState = removeTabFromTerminalState(removedTabsState, tab.id)
        }
        const nextTabsByWorktree = keepIdentifiers
          ? s.tabsByWorktree
          : {
              ...s.tabsByWorktree,
              [worktreeId]: (s.tabsByWorktree[worktreeId] ?? []).map((tab, index) =>
                clearTransientTerminalState(tab, index)
              )
            }
        const nextPtyIdsByTabId = {
          ...s.ptyIdsByTabId,
          ...Object.fromEntries(tabs.map((tab) => [tab.id, [] as string[]] as const))
        }
        const nextRuntimePaneTitlesByTabId = keepIdentifiers
          ? s.runtimePaneTitlesByTabId
          : removedTabsState.runtimePaneTitlesByTabId
        const nextSuppressedPtyExitIds = {
          ...s.suppressedPtyExitIds,
          ...Object.fromEntries(exitGuardPtyIds.map((ptyId) => [ptyId, true] as const))
        }
        // Why: pendingCodexPaneRestartIds is keyed by ptyId — under sleep we
        // preserve it so a mid-restart marker survives wake against the same
        // identifier. codexRestartNoticeByPtyId is also keyed by the now-stale
        // ptyId; on wake the post-spawn ptyId may differ, so the notice can't
        // be carried forward and is cleared in both cases.
        const nextPendingCodexPaneRestartIds = keepIdentifiers
          ? s.pendingCodexPaneRestartIds
          : { ...s.pendingCodexPaneRestartIds }
        const nextCodexRestartNoticeByPtyId = { ...s.codexRestartNoticeByPtyId }
        for (const ptyId of exitGuardPtyIds) {
          if (!keepIdentifiers) {
            delete nextPendingCodexPaneRestartIds[ptyId]
          }
          delete nextCodexRestartNoticeByPtyId[ptyId]
        }
        // Why: setup splits are transient one-shots that drive new-tab UX. They
        // are not sleep-recovery state, so clear them in both cases.
        const nextPendingSetupSplitByTabId = removedTabsState.pendingSetupSplitByTabId
        // Why: under remove-worktree (default), layout snapshots carry
        // `ptyIdsByLeafId` referencing now-dead PTY IDs; if we leave them, the
        // next remount takes the reattach branch in connectPanePty and produces
        // a visible but non-interactive "zombie" pane. Under sleep
        // (keepIdentifiers), we preserve `ptyIdsByLeafId` precisely so wake can
        // pass them as args.sessionId to pty.spawn and reattach to the daemon
        // history dir (or, on SSH, restore scrollback from buffersByLeafId
        // captured above).
        const nextTerminalLayoutsByTabId = { ...s.terminalLayoutsByTabId }
        // Why: unread dots survive across worktree switches by design, but a
        // full shutdown tears down the PTYs behind them. Even under sleep, the
        // PTYs are killed, so unread state pointing at dead ptyIds is stale —
        // clear in both cases. (Carrying the dot across sleep would also be
        // surprising and inconsistent with how it behaves on tab close.)
        // Why: preserve the unreadTerminalTabs reference when none of the
        // shutting-down tabs had an unread flag — avoids a no-op top-level
        // state allocation that would force re-evaluation of full-state
        // selectors on unrelated shutdown calls. Mirrors the sibling pattern
        // in tabs.ts.
        const nextUnreadTerminalTabs = removedTabsState.unreadTerminalTabs
        const nextUnreadTerminalPanes = removedTabsState.unreadTerminalPanes
        const nextUnreadAgentCompletionPanes = removedTabsState.unreadAgentCompletionPanes
        const nextLastTerminalInputAtByPaneKey = removedTabsState.lastTerminalInputAtByPaneKey
        for (const tab of tabs) {
          if (!keepIdentifiers) {
            const existingLayout = nextTerminalLayoutsByTabId[tab.id]
            if (existingLayout?.ptyIdsByLeafId) {
              nextTerminalLayoutsByTabId[tab.id] = {
                ...existingLayout,
                ptyIdsByLeafId: {}
              }
            }
          }
        }

        // Why: under remove-worktree, intentional shutdown kills the relay PTY
        // and persisting a dead session ID would cause next-restart reattach to
        // fail. Under sleep, wake re-spawns over the relay against this exact
        // session ID — preserving it is what lets the wake-side wiring stay
        // consistent.
        const nextLastKnownRelay = keepIdentifiers
          ? s.lastKnownRelayPtyIdByTabId
          : removedTabsState.lastKnownRelayPtyIdByTabId

        return {
          tabsByWorktree: nextTabsByWorktree,
          ptyIdsByTabId: nextPtyIdsByTabId,
          lastKnownRelayPtyIdByTabId: nextLastKnownRelay,
          runtimePaneTitlesByTabId: nextRuntimePaneTitlesByTabId,
          suppressedPtyExitIds: nextSuppressedPtyExitIds,
          pendingCodexPaneRestartIds: nextPendingCodexPaneRestartIds,
          codexRestartNoticeByPtyId: nextCodexRestartNoticeByPtyId,
          pendingSetupSplitByTabId: nextPendingSetupSplitByTabId,
          terminalLayoutsByTabId: nextTerminalLayoutsByTabId,
          // Why: skip writing unreadTerminalTabs when the reference is unchanged —
          // avoids a no-op top-level state allocation that would force re-evaluation
          // of full-state selectors. Mirrors the sibling pattern in tabs.ts.
          ...(nextUnreadTerminalTabs !== s.unreadTerminalTabs
            ? { unreadTerminalTabs: nextUnreadTerminalTabs }
            : {}),
          ...(nextUnreadTerminalPanes !== s.unreadTerminalPanes
            ? { unreadTerminalPanes: nextUnreadTerminalPanes }
            : {}),
          ...(nextUnreadAgentCompletionPanes !== s.unreadAgentCompletionPanes
            ? { unreadAgentCompletionPanes: nextUnreadAgentCompletionPanes }
            : {}),
          ...(nextLastTerminalInputAtByPaneKey !== s.lastTerminalInputAtByPaneKey
            ? { lastTerminalInputAtByPaneKey: nextLastTerminalInputAtByPaneKey }
            : {})
        }
      })

      if (keepIdentifiers) {
        set((s) => {
          const base =
            shutdownReason === 'manual-sleep'
              ? removeSleepingRecordsReplacedByManualWorktreeSleep(
                  s.sleepingAgentSessionsByPaneKey,
                  worktreeId,
                  opts?.sleepingPaneKeys
                ).records
              : s.sleepingAgentSessionsByPaneKey
          return {
            sleepingAgentSessionsByPaneKey: {
              ...base,
              ...sleepingAgentSessionRecords
            }
          }
        })
      } else {
        get().clearSleepingAgentSessionsByWorktree(worktreeId)
      }

      // Why: only automatic completed-agent sleep keeps passive completion
      // evidence; manual sleep/remove still fold the entire worktree surface.
      get().dropAgentStatusByWorktree(worktreeId, {
        shutdownReason,
        sleepingPaneKeys: opts?.sleepingPaneKeys,
        retainedCompletionEvidence
      })
      get().clearPaneForegroundAgentByWorktree(worktreeId)

      if (rendererShutdownPtyIds.length === 0 && expectedRuntimePtyIds.length === 0) {
        return
      }

      if (runtimeEnvironmentId && expectedRuntimePtyIds.length === 0) {
        await openRuntimeTerminalClient({
          kind: 'environment',
          environmentId: runtimeEnvironmentId
        })
          .then((client) =>
            client.stop(toRuntimeWorktreeSelector(worktreeId), { timeoutMs: 15_000 })
          )
          .catch(() => null)
      }

      await Promise.allSettled(
        rendererShutdownPtyIds.filter((ptyId) => !isRuntimePtyId(ptyId)).map(closeRuntimeTerminal)
      )
    }
  }
}
