import { worktreeWorkspaceKey } from '@yiru/protocol/workspace/identity'
import type { WorkspaceVisibleTabType } from '@yiru/protocol/workspace/tabs'
import type { WorktreeMeta } from '@yiru/protocol/worktree/model'
import type { StateCreator } from 'zustand'
import {
  markInputQuietSchedulerInput,
  scheduleAfterInputQuiet
} from '~renderer/keyboard-input/quiet-scheduler'
import { readProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import { updateProjectCatalogWorktree } from '~renderer/project-catalog/worktree-cache'
import { tabHasLivePty } from '~renderer/tab-bar/has-live-pty'
import { refreshOwnedWorktreeCatalog } from '~renderer/worktree/catalog-refresh'

import type { AppState } from '../../store/types'
import { getActiveUnifiedTabForWorktree } from './activation-model'
import { toVisibleTabType } from './host-model'
import { findKnownWorktreeById, isRuntimeSelectorNotFoundError } from './known-model'
import {
  ACTIVE_WORKTREE_TERMINAL_PREP_DELAY_MS,
  ACTIVE_WORKTREE_TERMINAL_PREP_INPUT_QUIET_MS,
  ACTIVE_WORKTREE_TERMINAL_PREP_IDLE_TIMEOUT_MS,
  pendingActivationTerminalPrepCancels,
  getActivationSpawnSuppression,
  shouldDeferActivationTerminalPrep
} from './refresh-model'
import { persistWorktreeMeta } from './review-resolver'
import { settingsForWorktreeOwner } from './runtime-owner'
import type { WorktreeSlice } from './types'

export function createWorktreeActivationActions(
  set: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[1]
): Pick<WorktreeSlice, 'setActiveWorktree'> {
  return {
    setActiveWorktree: (worktreeId) => {
      if (worktreeId && shouldDeferActivationTerminalPrep()) {
        markInputQuietSchedulerInput()
      }

      const reconciledActiveTabId = worktreeId
        ? get().reconcileWorktreeTabModel(worktreeId).activeRenderableTabId
        : null
      const catalogState = readProjectCatalogRuntimeState()
      const selectedWorktree = worktreeId
        ? findKnownWorktreeById(catalogState, worktreeId)
        : undefined
      const shouldClearUnread = Boolean(selectedWorktree?.isUnread)
      if (worktreeId && shouldClearUnread) {
        updateProjectCatalogWorktree(worktreeId, { isUnread: false })
      }
      let shouldPrepareTerminalTabs = false
      let shouldTagTerminalTabs = false
      set((s) => {
        if (!worktreeId) {
          return {
            activeWorktreeId: null,
            activeWorkspaceKey: null,
            // Why: activating any real worktree (or clearing it) must dismiss the
            // background-creation panel so the user isn't stranded on it.
            activePendingCreationId: null
          }
        }

        // Restore per-worktree editor state
        // Why: Search now lives under Explorer, so the files/search sub-route
        // must switch with the worktree instead of leaking the previous one.
        const restoredRightSidebarExplorerView =
          s.rightSidebarExplorerViewByWorktree?.[worktreeId] ?? 'files'
        const restoredRightSidebarTab = s.rightSidebarTabByWorktree?.[worktreeId] ?? 'explorer'
        const restoredFileId = s.activeFileIdByWorktree[worktreeId] ?? null
        const restoredBrowserTabId = s.activeBrowserTabIdByWorktree[worktreeId] ?? null
        const restoredTabType = s.activeTabTypeByWorktree[worktreeId] ?? 'terminal'
        const activeUnifiedTab = getActiveUnifiedTabForWorktree(
          s,
          worktreeId,
          reconciledActiveTabId
        )
        // Verify the restored file still exists in openFiles
        const fileStillOpen = restoredFileId
          ? s.openFiles.some((f) => f.id === restoredFileId && f.worktreeId === worktreeId)
          : false
        const browserTabs = s.browserTabsByWorktree[worktreeId] ?? []
        const browserTabStillOpen = restoredBrowserTabId
          ? browserTabs.some((tab) => tab.id === restoredBrowserTabId)
          : false
        const hasGroupOwnedSurface =
          (s.groupsByWorktree[worktreeId]?.length ?? 0) > 0 ||
          Boolean(s.layoutByWorktree[worktreeId])

        // Why: worktree activation must restore from the reconciled tab-group
        // model first. Split groups are now the ownership model for visible
        // content; if we prefer the legacy activeTabType/browser/file fallbacks
        // when the two models disagree, the renderer can reopen a surface that
        // has no backing unified tab and show a blank worktree.
        let activeFileId: string | null
        let activeBrowserTabId: string | null
        let activeTabType: WorkspaceVisibleTabType
        if (activeUnifiedTab) {
          activeFileId =
            activeUnifiedTab.contentType === 'editor' ||
            activeUnifiedTab.contentType === 'diff' ||
            activeUnifiedTab.contentType === 'conflict-review' ||
            activeUnifiedTab.contentType === 'check-details'
              ? activeUnifiedTab.entityId
              : fileStillOpen
                ? restoredFileId
                : null
          activeBrowserTabId =
            activeUnifiedTab.contentType === 'browser'
              ? activeUnifiedTab.entityId
              : browserTabStillOpen
                ? restoredBrowserTabId
                : (browserTabs[0]?.id ?? null)
          activeTabType = toVisibleTabType(activeUnifiedTab.contentType)
        } else if (hasGroupOwnedSurface) {
          activeFileId = fileStillOpen ? restoredFileId : null
          activeBrowserTabId = browserTabStillOpen
            ? restoredBrowserTabId
            : (browserTabs[0]?.id ?? null)
          activeTabType = 'terminal'
        } else if (restoredTabType === 'terminal') {
          activeFileId = fileStillOpen ? restoredFileId : null
          activeBrowserTabId = browserTabStillOpen
            ? restoredBrowserTabId
            : (browserTabs[0]?.id ?? null)
          activeTabType = 'terminal'
        } else if (restoredTabType === 'browser' && browserTabStillOpen) {
          activeFileId = fileStillOpen ? restoredFileId : null
          activeBrowserTabId = restoredBrowserTabId
          activeTabType = 'browser'
        } else if (restoredTabType === 'editor' && fileStillOpen) {
          activeFileId = restoredFileId
          activeBrowserTabId = browserTabStillOpen
            ? restoredBrowserTabId
            : (browserTabs[0]?.id ?? null)
          activeTabType = 'editor'
        } else if (browserTabStillOpen) {
          activeFileId = null
          activeBrowserTabId = restoredBrowserTabId
          activeTabType = 'browser'
        } else if (fileStillOpen) {
          activeFileId = restoredFileId
          activeBrowserTabId = browserTabs[0]?.id ?? null
          activeTabType = 'editor'
        } else {
          const fallbackFile = s.openFiles.find((f) => f.worktreeId === worktreeId)
          const fallbackBrowserTab = browserTabs[0] ?? null
          activeFileId = fallbackFile?.id ?? null
          activeBrowserTabId = browserTabStillOpen
            ? restoredBrowserTabId
            : (fallbackBrowserTab?.id ?? null)
          activeTabType = fallbackFile ? 'editor' : fallbackBrowserTab ? 'browser' : 'terminal'
        }

        // Why: restore the last-active terminal tab for this worktree so the
        // user returns to the same tab they left, not always the first one.
        const restoredTabId = s.activeTabIdByWorktree[worktreeId] ?? null
        const worktreeTabs = s.tabsByWorktree[worktreeId] ?? []
        const tabStillExists = restoredTabId
          ? worktreeTabs.some((t) => t.id === restoredTabId)
          : false
        const activeTabId =
          activeUnifiedTab?.contentType === 'terminal'
            ? activeUnifiedTab.entityId
            : tabStillExists
              ? restoredTabId
              : (worktreeTabs[0]?.id ?? null)

        // Why: focusing a worktree is not meaningful background activity for the
        // smart sort. Writing lastActivityAt here makes the next unrelated
        // sortEpoch bump reshuffle cards based on what the user merely looked at,
        // which is the "jump after focus" bug reported in Slack. Keep selection
        // side-effects limited to unread clearing; true activity signals such as
        // PTY lifecycle and explicit edits still flow through bumpWorktreeActivity.
        // Why: dead-PTY terminal prep must complete before the workspace shell
        // renders that tab. The shell render is deferred below, so terminal prep
        // can wait for input quiet instead of blocking the activation click.
        //
        // Why pendingActivationSpawn + first-activation check: the first time a
        // worktree is activated in this session, its TerminalPane mounts and
        // each tab's PTY either reattaches (restored session) or fresh-spawns
        // (never visited). Both paths call updateTabPtyId; neither is real
        // activity — they are side-effects of the click. Tag every tab on the
        // FIRST activation so the resulting updateTabPtyId suppresses both the
        // activity bump and the sortEpoch bump.
        //
        // We can't use tab.ptyId==null as the guard (what the old `allDead`
        // check did): reconnectPersistedTerminals re-populates tab.ptyId with
        // restored daemon session IDs *before* the pane mounts, so tabs look
        // live to allDead even though the next updateTabPtyId is a reattach.
        // Tracking first-activation per worktree is the reliable signal.
        //
        // Generation is still only bumped when tabs have no live PTY — a live
        // tab remount would kill the user's running shell.
        const tabs = s.tabsByWorktree[worktreeId ?? ''] ?? []
        const allDead =
          worktreeId != null &&
          tabs.length > 0 &&
          tabs.every((tab) => !tabHasLivePty(s.ptyIdsByTabId, tab.id))
        const isFirstActivation = worktreeId != null && !s.everActivatedWorktreeIds.has(worktreeId)
        const shouldTagTabs = worktreeId != null && tabs.length > 0 && isFirstActivation
        // Why: when every PTY for the worktree's tabs is dead, the existing
        // (hidden) TerminalPane wraps a dead transport. Once activeWorktreeId
        // commits, that pane becomes visible and accepts keystrokes that the
        // dead transport silently drops. Bump generation in the SAME set() so
        // React/Zustand commit activation and the remount key in one render —
        // no visible-but-dead-transport window. First-activation tagging
        // (shouldTagTabs without allDead) does not remount panes and stays on
        // the deferred path below.
        shouldPrepareTerminalTabs = Boolean(
          worktreeId && tabs.length > 0 && shouldTagTabs && !allDead
        )
        shouldTagTerminalTabs = shouldTagTabs
        const nextEverActivated = isFirstActivation
          ? new Set([...s.everActivatedWorktreeIds, worktreeId!])
          : s.everActivatedWorktreeIds
        const tabsByWorktreeUpdate =
          allDead && worktreeId != null
            ? {
                tabsByWorktree: {
                  ...s.tabsByWorktree,
                  [worktreeId]: tabs.map((tab) => ({
                    ...tab,
                    generation: (tab.generation ?? 0) + 1,
                    pendingActivationSpawn: getActivationSpawnSuppression(
                      s.terminalLayoutsByTabId[tab.id]
                    )
                  }))
                }
              }
            : {}

        const nextActiveTabTypeByWorktree =
          s.activeTabTypeByWorktree[worktreeId] === activeTabType
            ? s.activeTabTypeByWorktree
            : { ...s.activeTabTypeByWorktree, [worktreeId]: activeTabType }
        const activeWorkspaceKey = worktreeWorkspaceKey(worktreeId)
        const hasStateChange =
          s.activeWorktreeId !== worktreeId ||
          s.activeWorkspaceKey !== activeWorkspaceKey ||
          // Why: a pending-creation panel can be showing while activeWorktreeId is
          // still the prior worktree. Re-selecting that same worktree must clear
          // the panel, so a non-null activePendingCreationId counts as a change.
          s.activePendingCreationId !== null ||
          s.activeFileId !== activeFileId ||
          s.activeBrowserTabId !== activeBrowserTabId ||
          s.activeTabType !== activeTabType ||
          s.rightSidebarTab !== restoredRightSidebarTab ||
          s.rightSidebarExplorerView !== restoredRightSidebarExplorerView ||
          s.activeTabId !== activeTabId ||
          nextActiveTabTypeByWorktree !== s.activeTabTypeByWorktree ||
          nextEverActivated !== s.everActivatedWorktreeIds
        if (!hasStateChange) {
          // Why: repeated activation of the already-active worktree can come from
          // clicks, IPC, and background restore paths. Preserve the root Zustand
          // reference so session persistence/runtime sync do not fan out on a no-op.
          return s
        }

        return {
          activeWorktreeId: worktreeId,
          activeWorkspaceKey,
          activePendingCreationId: null,
          activeFileId,
          activeBrowserTabId,
          activeTabType,
          activeTabTypeByWorktree: nextActiveTabTypeByWorktree,
          rightSidebarTab: restoredRightSidebarTab,
          rightSidebarExplorerView: restoredRightSidebarExplorerView,
          activeTabId,
          everActivatedWorktreeIds: nextEverActivated,
          ...tabsByWorktreeUpdate
        }
      })

      if (worktreeId && shouldPrepareTerminalTabs) {
        const prepareTerminalTabs = (): void => {
          pendingActivationTerminalPrepCancels.delete(worktreeId)
          set((s) => {
            if (s.activeWorktreeId !== worktreeId) {
              return {}
            }
            const tabs = s.tabsByWorktree[worktreeId] ?? []
            if (tabs.length === 0) {
              return {}
            }
            const allDead = tabs.every((tab) => !tabHasLivePty(s.ptyIdsByTabId, tab.id))
            if (!allDead && !shouldTagTerminalTabs) {
              return {}
            }
            return {
              tabsByWorktree: {
                ...s.tabsByWorktree,
                [worktreeId]: tabs.map((tab) => ({
                  ...tab,
                  ...(allDead ? { generation: (tab.generation ?? 0) + 1 } : {}),
                  // Why: slept terminal remount/spawn is click-driven wake work.
                  // Tag the resulting PTY updates so they do not reshuffle Recent.
                  pendingActivationSpawn: getActivationSpawnSuppression(
                    s.terminalLayoutsByTabId[tab.id]
                  )
                }))
              }
            }
          })
        }

        const cancelExistingPrep = pendingActivationTerminalPrepCancels.get(worktreeId)
        if (cancelExistingPrep) {
          cancelExistingPrep()
        }
        if (shouldDeferActivationTerminalPrep()) {
          pendingActivationTerminalPrepCancels.set(
            worktreeId,
            scheduleAfterInputQuiet(prepareTerminalTabs, {
              delayMs: ACTIVE_WORKTREE_TERMINAL_PREP_DELAY_MS,
              quietMs: ACTIVE_WORKTREE_TERMINAL_PREP_INPUT_QUIET_MS,
              idleTimeoutMs: ACTIVE_WORKTREE_TERMINAL_PREP_IDLE_TIMEOUT_MS
            })
          )
        } else {
          prepareTerminalTabs()
        }
      }

      // Why: activation is explicit enough to revalidate PR state immediately;
      // the GitHub coordinator still coalesces requests and applies rate guards.
      if (worktreeId) {
        get().refreshGitHubForWorktreeIfStale(worktreeId)
      }

      if (!worktreeId || !get().getKnownWorktreeById(worktreeId)) {
        return
      }

      if (shouldClearUnread) {
        const updates: Partial<WorktreeMeta> = {
          isUnread: false
        }

        void persistWorktreeMeta(
          settingsForWorktreeOwner(catalogState, worktreeId),
          worktreeId,
          updates
        ).catch((err) => {
          if (isRuntimeSelectorNotFoundError(err)) {
            void refreshOwnedWorktreeCatalog(readProjectCatalogRuntimeState(), worktreeId)
            return
          }
          console.error('Failed to persist worktree activation state:', err)
          void refreshOwnedWorktreeCatalog(readProjectCatalogRuntimeState(), worktreeId)
        })
      }
    }
  }
}
