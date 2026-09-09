import type { TerminalTab } from '@yiru/protocol/workspace/tabs'
import type { StateCreator } from 'zustand'
import { closeRuntimeTerminal } from '~renderer/runtime/terminal-inspection'
import { retireParkedTerminalTab } from '~renderer/runtime/terminal-parked-watcher-registry'
import { openRuntimeTerminalClient } from '~renderer/runtime/terminal-protocol'
import { forgetForegroundTerminalTabs } from '~renderer/tab-bar/foreground-terminals'
import { forgetAgentHibernationTabOutput } from '~renderer/terminal-pane/agent/hibernation-output-activity'
import { forgetAgentStartupDeliveriesForTabs } from '~renderer/terminal-pane/agent/startup-delivery-guards'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

import type { AppState } from '../../store/types'
import {
  pushClosedTerminalTabSnapshot,
  pushRecentlyClosedTabKind
} from '../../tab-bar/state/recently-closed'
import { removeTabFromTerminalState } from './removal'
import type { TerminalSlice } from './slice'
import { buildTerminalTabRetirementPlan, removeSleepingAgentSessionsForTab } from './tab-retirement'

export function createTerminalCloseActions(
  set: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[1]
): Pick<TerminalSlice, 'closeTab'> {
  return {
    closeTab: (tabId, opts) => {
      const closeReason = opts?.reason ?? 'user'
      const retiresSession = closeReason === 'user' || closeReason === 'cleanup'
      const retirementPlan =
        opts?.precomputedRetirementPlan?.tabId === tabId
          ? opts.precomputedRetirementPlan
          : buildTerminalTabRetirementPlan(get(), tabId)
      let closingWorktreeId: string | null = null

      // Why: a parked tab has no mounted TerminalPane cleanup. Retirement must
      // synchronously revoke its observer/candidate state before provider exit races.
      retireParkedTerminalTab(tabId)
      if (retiresSession) {
        const fallbackRuntimeEnvironmentId = retirementPlan.worktreeId
          ? getRuntimeEnvironmentIdForWorktree(get(), retirementPlan.worktreeId)
          : null
        const retirementTasks: Promise<unknown>[] = opts?.localPtyTeardownOwnedExternally
          ? []
          : retirementPlan.localOrSshPtyIds.map(closeRuntimeTerminal)
        const localOrSshTaskCount = retirementTasks.length
        if (!opts?.remoteCloseOwnedByHost) {
          for (const terminal of retirementPlan.runtimeTerminals) {
            const environmentId = terminal.environmentId ?? fallbackRuntimeEnvironmentId
            retirementTasks.push(
              openRuntimeTerminalClient(
                environmentId ? { kind: 'environment', environmentId } : { kind: 'local' }
              ).then((client) => client.close(terminal.handle))
            )
          }
        }
        if (retirementPlan.unroutablePtyIds.length > 0) {
          console.warn('[terminal-retirement] skipped unroutable runtime handles', {
            tabId,
            count: retirementPlan.unroutablePtyIds.length
          })
        }
        // Why: close remains synchronous and idempotent; provider failures must
        // not reject into the UI or prevent renderer ownership from being revoked.
        void Promise.allSettled(retirementTasks).then((results) => {
          const localOrSshFailures = results
            .slice(0, localOrSshTaskCount)
            .filter((result) => result.status === 'rejected').length
          const runtimeFailures = results
            .slice(localOrSshTaskCount)
            .filter((result) => result.status === 'rejected').length
          if (localOrSshFailures > 0 || runtimeFailures > 0) {
            console.warn('[terminal-retirement] provider teardown failed', {
              tabId,
              localOrSshFailures,
              runtimeFailures
            })
          }
        })
      }

      set((s) => {
        let closedTab: TerminalTab | null = null
        let closedWorktreeId: string | null = null
        for (const [worktreeId, tabs] of Object.entries(s.tabsByWorktree)) {
          const candidate = tabs.find((tab) => tab.id === tabId)
          if (candidate) {
            closedTab = candidate
            closedWorktreeId = worktreeId
            closingWorktreeId = worktreeId
            break
          }
        }
        // Why: only explicit user closes feed the Cmd+Shift+T reopen stack.
        // Cleanup and PTY-exit closes must not pollute user undo history.
        const capturedSnapshot =
          closeReason === 'user' &&
          opts?.captureRecentlyClosed !== false &&
          closedTab &&
          closedWorktreeId
            ? {
                ...(closedTab.startupCwd ? { startupCwd: closedTab.startupCwd } : {}),
                ...(closedTab.shellOverride ? { shellOverride: closedTab.shellOverride } : {}),
                ...(closedTab.customTitle ? { customTitle: closedTab.customTitle } : {}),
                ...(closedTab.color ? { color: closedTab.color } : {})
              }
            : null
        const removed = removeTabFromTerminalState(s, tabId)
        const nextSleepingAgentSessionsByPaneKey = retiresSession
          ? removeSleepingAgentSessionsForTab(s.sleepingAgentSessionsByPaneKey, tabId)
          : s.sleepingAgentSessionsByPaneKey

        // Why: if the tab had a ptyId with unconsumed snapshot or cold restore
        // data (e.g., tab closed before TerminalPane mounted), clean it up to
        // prevent unbounded store growth across restarts.
        let nextSnapshots = s.pendingSnapshotByPtyId
        let nextColdRestores = s.pendingColdRestoreByPtyId
        const closingPtyIds = new Set([
          ...retirementPlan.localOrSshPtyIds,
          ...retirementPlan.runtimeTerminals.map((terminal) => terminal.ptyId),
          ...retirementPlan.cleanupOnlyPtyIds,
          ...retirementPlan.unroutablePtyIds
        ])
        for (const closingId of closingPtyIds) {
          if (closingId in nextSnapshots) {
            nextSnapshots = { ...nextSnapshots }
            delete nextSnapshots[closingId]
          }
          if (closingId in nextColdRestores) {
            nextColdRestores = { ...nextColdRestores }
            delete nextColdRestores[closingId]
          }
        }

        return {
          ...removed,
          pendingSnapshotByPtyId: nextSnapshots,
          pendingColdRestoreByPtyId: nextColdRestores,
          ...(nextSleepingAgentSessionsByPaneKey !== s.sleepingAgentSessionsByPaneKey
            ? { sleepingAgentSessionsByPaneKey: nextSleepingAgentSessionsByPaneKey }
            : {}),
          ...(capturedSnapshot && closedWorktreeId
            ? {
                recentlyClosedTerminalTabsByWorktree: pushClosedTerminalTabSnapshot(
                  s.recentlyClosedTerminalTabsByWorktree,
                  closedWorktreeId,
                  capturedSnapshot
                ),
                recentlyClosedTabKindsByWorktree: pushRecentlyClosedTabKind(
                  s.recentlyClosedTabKindsByWorktree,
                  closedWorktreeId,
                  'terminal'
                )
              }
            : {})
        }
      })
      // Why: sweep live AND retained agent-status entries for this tab — closing
      // the tab is the user telling us "I'm done with this session", so any
      // completion snapshots it left behind (in the inline agents list) must go
      // too. Use dropAgentStatusByTabPrefix (not removeAgentStatusByTabPrefix)
      // so retention suppressors are planted: a live→gone transition inside the
      // same frame as the tab close cannot re-snapshot a row we just dropped.
      // Why: Pi can leave a completed row attributed to the worktree but keyed
      // under an already-missing tab id; pass the worktree to sweep only that
      // completed orphan while preserving active pre-render child rows.
      get().dropAgentStatusByTabPrefix(
        tabId,
        closingWorktreeId ? { worktreeId: closingWorktreeId } : undefined
      )
      // Why: retired pane keys never recur, so stranded foreground entries would
      // accumulate for the renderer's whole lifetime.
      get().clearPaneForegroundAgentByTabPrefix(tabId)
      // Why: closing a tab permanently retires every pane under it (a reopen mints
      // a fresh leafId at epoch 0), so drop the panes' hibernation output epochs to
      // keep that module-level map from growing for the renderer's whole lifetime.
      forgetAgentHibernationTabOutput(tabId)
      // Why: same rationale for the tab's foreground last-seen timestamp and any
      // consumed agent-startup delivery guards — retired tab ids never recur.
      forgetForegroundTerminalTabs([tabId])
      forgetAgentStartupDeliveriesForTabs([tabId])
      for (const tabs of Object.values(get().unifiedTabsByWorktree)) {
        const workspaceItem = tabs.find(
          (entry) => entry.contentType === 'terminal' && entry.entityId === tabId
        )
        if (workspaceItem) {
          get().closeUnifiedTab(workspaceItem.id, {
            recordInteraction: opts?.recordInteraction,
            terminalRetirementHandled: true
          })
        }
      }
    }
  }
}
