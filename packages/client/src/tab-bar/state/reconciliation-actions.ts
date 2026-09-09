import type { Tab } from '@yiru/protocol/workspace/tabs'
import type { StateCreator } from 'zustand'

import type { AppState } from '../../store/types'
import {
  buildOrphanTerminalCleanupPatch,
  dropOrphanTerminalAgentStatus,
  getOrphanTerminalIds
} from '../../terminal/state/orphan-state'
import { dedupeTabOrder, ensureGroup, sanitizeRecentTabIds, updateGroup } from './group-state'
import { pruneTabGroupLayoutForGroups } from './hydration'
import type { TabsSlice } from './slice'

export function createReconciliationActions(
  set: Parameters<StateCreator<AppState, [], [], TabsSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], TabsSlice>>[1]
): Pick<TabsSlice, 'reconcileWorktreeTabModel'> {
  return {
    reconcileWorktreeTabModel: (worktreeId) => {
      const state = get()
      const unifiedTabs = state.unifiedTabsByWorktree[worktreeId] ?? []
      const groups = state.groupsByWorktree[worktreeId] ?? []
      const runtimeTerminalTabs = state.tabsByWorktree[worktreeId] ?? []
      const unifiedTerminalEntityIds = new Set(
        unifiedTabs.filter((tab) => tab.contentType === 'terminal').map((tab) => tab.entityId)
      )
      const legacyRuntimeTerminalTabs = runtimeTerminalTabs.filter((tab) => {
        if (unifiedTerminalEntityIds.has(tab.id)) {
          return false
        }
        // Why: this is a one-shot migration filter for tabs not yet promoted
        // to unifiedTabs — keeping the wake-hint `tab.ptyId` clause is
        // intentional. tab.ptyId is the preserved sessionId (so wake can
        // reattach to the same daemon-history dir / relay session); a slept
        // tab will have `livePtyIds` empty *and* `tab.ptyId` populated, and
        // we want it included in the migration sweep so reconcile picks it
        // up. Reconcile fires again post-reattach, so the eventual live PTY
        // also routes through this branch. Do *not* repurpose this as an
        // "is this tab alive?" check — those reads must use ptyIdsByTabId.
        const livePtyIds = state.ptyIdsByTabId[tab.id] ?? []
        return livePtyIds.length > 0 || tab.ptyId != null
      })
      const orphanTerminalIds = getOrphanTerminalIds(state, worktreeId)
      const ensuredGroupState =
        legacyRuntimeTerminalTabs.length > 0
          ? ensureGroup(
              state.groupsByWorktree,
              state.activeGroupIdByWorktree,
              worktreeId,
              state.activeGroupIdByWorktree[worktreeId]
            )
          : null
      const reconciliationGroup = ensuredGroupState?.group ?? groups[0] ?? null
      const restoredLegacyTabs =
        reconciliationGroup == null
          ? []
          : legacyRuntimeTerminalTabs
              .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
              .map((tab) => ({
                id: tab.id,
                entityId: tab.id,
                groupId: reconciliationGroup.id,
                worktreeId,
                contentType: 'terminal' as const,
                label: tab.title,
                ...(tab.quickCommandLabel?.trim()
                  ? { quickCommandLabel: tab.quickCommandLabel.trim() }
                  : {}),
                ...(tab.generatedTitle?.trim()
                  ? { generatedLabel: tab.generatedTitle.trim() }
                  : {}),
                customLabel: tab.customTitle,
                color: tab.color,
                sortOrder: tab.sortOrder,
                createdAt: tab.createdAt
              }))
      const reconciledUnifiedTabs =
        restoredLegacyTabs.length > 0 ? [...unifiedTabs, ...restoredLegacyTabs] : unifiedTabs
      // Why: when a freshly-ensured group has no active tab yet, seed it from the
      // worktree's remembered selection before the first restored tab. Otherwise
      // returning to a worktree whose terminals only exist in the runtime slice
      // always reopens on Terminal 1 and drops the tab the user left on.
      const rememberedLegacyActiveTabId = state.activeTabIdByWorktree[worktreeId]
      const restoredLegacyTabIds = new Set(restoredLegacyTabs.map((tab) => tab.id))
      const legacyFallbackActiveTabId =
        rememberedLegacyActiveTabId && restoredLegacyTabIds.has(rememberedLegacyActiveTabId)
          ? rememberedLegacyActiveTabId
          : (restoredLegacyTabs[0]?.id ?? null)
      const reconciledGroups =
        restoredLegacyTabs.length > 0 && reconciliationGroup
          ? updateGroup(ensuredGroupState!.groupsByWorktree[worktreeId] ?? [], {
              ...reconciliationGroup,
              // Why: legacy terminal tabs can still exist in the runtime slice
              // after split groups became the source of truth. Restoring them
              // into the active/root group keeps existing live PTYs reachable
              // instead of making activation spawn a duplicate "Terminal 2".
              activeTabId: reconciliationGroup.activeTabId ?? legacyFallbackActiveTabId,
              tabOrder: dedupeTabOrder([
                ...reconciliationGroup.tabOrder,
                ...restoredLegacyTabs.map((tab) => tab.id)
              ])
            })
          : groups
      const liveTerminalIds = new Set(
        runtimeTerminalTabs.filter((tab) => !orphanTerminalIds.has(tab.id)).map((tab) => tab.id)
      )
      const liveEditorIds = new Set(
        state.openFiles.filter((file) => file.worktreeId === worktreeId).map((file) => file.id)
      )
      const liveBrowserIds = new Set(
        (state.browserTabsByWorktree[worktreeId] ?? []).map((browserTab) => browserTab.id)
      )

      const isRenderableTab = (tab: Tab): boolean => {
        if (tab.contentType === 'terminal') {
          return liveTerminalIds.has(tab.entityId)
        }
        if (tab.contentType === 'browser') {
          return liveBrowserIds.has(tab.entityId)
        }
        if (tab.contentType === 'simulator') {
          return true
        }
        if (tab.contentType === 'git-graph') {
          return true
        }
        return liveEditorIds.has(tab.entityId)
      }

      const validTabs = reconciledUnifiedTabs.filter(isRenderableTab)
      const validTabIds = new Set(validTabs.map((tab) => tab.id))

      const nextGroupsWithEmpty = reconciledGroups.map((group) => {
        const tabOrder = group.tabOrder.filter((tabId) => validTabIds.has(tabId))
        const activeTabId =
          group.activeTabId && validTabIds.has(group.activeTabId)
            ? group.activeTabId
            : (tabOrder[0] ?? null)
        const tabOrderUnchanged =
          tabOrder.length === group.tabOrder.length &&
          tabOrder.every((tabId, index) => tabId === group.tabOrder[index])
        // Why: reconciliation can drop backing tabs (stale persisted ids, dead
        // PTYs, closed editor files). Keep the MRU stack in sync so the next
        // close doesn't try to activate a tab the renderer no longer owns.
        const recentTabIds = sanitizeRecentTabIds(group.recentTabIds, tabOrder)
        const recentUnchanged =
          recentTabIds.length === (group.recentTabIds ?? []).length &&
          recentTabIds.every((id, index) => id === (group.recentTabIds ?? [])[index])
        return tabOrderUnchanged && activeTabId === group.activeTabId && recentUnchanged
          ? group
          : { ...group, tabOrder, activeTabId, recentTabIds }
      })
      const nextGroups =
        validTabs.length > 0
          ? nextGroupsWithEmpty.filter((group) => group.tabOrder.length > 0)
          : nextGroupsWithEmpty

      const currentActiveGroupId =
        state.activeGroupIdByWorktree[worktreeId] ??
        ensuredGroupState?.activeGroupIdByWorktree[worktreeId]
      const activeGroupStillExists = nextGroups.some((group) => group.id === currentActiveGroupId)
      const nextActiveGroupId = activeGroupStillExists
        ? currentActiveGroupId
        : (nextGroups.find((group) => group.activeTabId !== null)?.id ??
          nextGroups[0]?.id ??
          currentActiveGroupId)

      const groupsChanged =
        nextGroups.length !== groups.length ||
        nextGroups.some((group, index) => group !== groups[index])
      const tabsChanged = validTabs.length !== unifiedTabs.length || restoredLegacyTabs.length > 0
      const activeGroupChanged = nextActiveGroupId !== currentActiveGroupId

      const baseNextLayout =
        restoredLegacyTabs.length > 0 && reconciliationGroup
          ? (state.layoutByWorktree[worktreeId] ?? {
              type: 'leaf',
              groupId: reconciliationGroup.id
            })
          : state.layoutByWorktree[worktreeId]
      const validGroupIds = new Set(nextGroups.map((group) => group.id))
      const prunedNextLayout =
        baseNextLayout && validGroupIds.size > 0
          ? pruneTabGroupLayoutForGroups(baseNextLayout, validGroupIds)
          : baseNextLayout
      const nextLayout =
        prunedNextLayout ??
        (nextGroups[0] ? { type: 'leaf', groupId: nextGroups[0].id } : undefined)
      const currentLayout = state.layoutByWorktree[worktreeId]
      const layoutChanged = nextLayout !== currentLayout

      if (
        tabsChanged ||
        groupsChanged ||
        activeGroupChanged ||
        layoutChanged ||
        orphanTerminalIds.size > 0
      ) {
        // Why: when reconcile drops a unified terminal tab (stale persisted id,
        // dead PTY, closed editor), its entry in unreadTerminalTabs (keyed by the
        // terminal tab's entityId) would otherwise linger forever and bleed into
        // downstream persistence/selectors. Mirrors the cleanup in closeUnifiedTab
        // which removes the unread flag when a terminal tab is torn down.
        const droppedTerminalEntityIds: string[] = []
        for (const tab of unifiedTabs) {
          if (tab.contentType !== 'terminal') {
            continue
          }
          if (!validTabIds.has(tab.id)) {
            droppedTerminalEntityIds.push(tab.entityId)
          }
        }
        set((current) => {
          let nextUnreadTerminalTabs = current.unreadTerminalTabs
          if (droppedTerminalEntityIds.length > 0) {
            let changed = false
            const copy = { ...current.unreadTerminalTabs }
            for (const entityId of droppedTerminalEntityIds) {
              if (copy[entityId]) {
                delete copy[entityId]
                changed = true
              }
            }
            if (changed) {
              nextUnreadTerminalTabs = copy
            }
          }
          return {
            unifiedTabsByWorktree: { ...current.unifiedTabsByWorktree, [worktreeId]: validTabs },
            groupsByWorktree: { ...current.groupsByWorktree, [worktreeId]: nextGroups },
            activeGroupIdByWorktree: {
              ...current.activeGroupIdByWorktree,
              [worktreeId]: nextActiveGroupId
            },
            ...(nextUnreadTerminalTabs !== current.unreadTerminalTabs
              ? { unreadTerminalTabs: nextUnreadTerminalTabs }
              : {}),
            ...(nextLayout && layoutChanged
              ? {
                  layoutByWorktree: {
                    ...current.layoutByWorktree,
                    // Why: a restored live runtime terminal needs a concrete leaf
                    // in the split-group model before activation runs again.
                    // Without this, the worktree still looks render-empty and the
                    // activation fallback spawns a duplicate "Terminal 2".
                    [worktreeId]: nextLayout!
                  }
                }
              : {}),
            ...(orphanTerminalIds.size > 0
              ? buildOrphanTerminalCleanupPatch(current, worktreeId, orphanTerminalIds)
              : {})
          }
        })
        // Why: the patch above removed the orphan tabs, so their agent rows must
        // be torn down the same way closeTab tears down a closed tab's rows.
        dropOrphanTerminalAgentStatus(get(), worktreeId, orphanTerminalIds)
      }

      const activeRenderableTabId =
        nextGroups.find((group) => group.id === nextActiveGroupId)?.activeTabId ??
        nextGroups.find((group) => group.activeTabId !== null)?.activeTabId ??
        null

      return {
        renderableTabCount: validTabs.length,
        activeRenderableTabId
      }
    }
  }
}
