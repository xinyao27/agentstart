import { worktreeWorkspaceKey } from '@yiru/protocol/workspace/identity'
import { splitWorktreeIdForFilesystem } from '@yiru/protocol/worktree/identity'

import type { AppState } from '../../store/types'
import {
  remapClosedTerminalTabSnapshotCwds,
  type ClosedTerminalTabSnapshot
} from '../../tab-bar/state/recently-closed'

export const WORKTREE_ID_KEYED_MAP_KEYS = [
  'worktreeLineageById',
  'tabsByWorktree',
  'deleteStateByWorktreeId',
  'baseStatusByWorktreeId',
  'fileSearchStateByWorktree',
  'browserTabsByWorktree',
  'activeBrowserTabIdByWorktree',
  'activeFileIdByWorktree',
  'activeTabTypeByWorktree',
  'activeTabIdByWorktree',
  'tabBarOrderByWorktree',
  'pendingReconnectTabByWorktree',
  'rightSidebarTabByWorktree',
  'rightSidebarExplorerViewByWorktree',
  'sourceControlPanelViewByWorktree',
  'gitGraphByWorktree',
  'gitGraphIncludeRemoteBranchesByWorktree',
  'gitGraphSelectedRefIdsByWorktree',
  'gitGraphColumnWidthsByWorktree',
  'unifiedTabsByWorktree',
  'groupsByWorktree',
  'layoutByWorktree',
  'activeGroupIdByWorktree',
  'gitStatusByWorktree',
  'gitStatusHeadByWorktree',
  'gitIgnoredPathsByWorktree',
  'gitConflictOperationByWorktree',
  'trackedConflictPathsByWorktree',
  'gitBranchChangesByWorktree',
  'gitBranchCompareSummaryByWorktree',
  'gitBranchCompareRequestKeyByWorktree',
  'gitBranchCompareRequestStatusHeadByWorktree',
  'showDotfilesByWorktree',
  'expandedDirs',
  'lastVisitedAtByWorktreeId',
  'defaultTerminalTabsAppliedByWorktreeId',
  'recentlyClosedTabKindsByWorktree'
] as const satisfies readonly (keyof AppState)[]

/**
 * Re-key every worktree-id-keyed map (plus the Set, openFiles[].worktreeId, and
 * the active/renaming pointers) from `oldWorktreeId` to `newWorktreeId` after a
 * folder rename changed the worktree's path-derived id. Tab-id/file-id-keyed maps
 * and the activeFile/activeTab/activeBrowserTab pointers are untouched because
 * tabs and files keep their ids. No-op when nothing references the old id.
 *
 * Main-process counterpart: `Store.migrateWorktreeIdentity` in persistence.ts
 * re-keys the persisted worktree state for the same id change.
 */
export function buildWorktreeRenameState(
  s: AppState,
  oldWorktreeId: string,
  newWorktreeId: string
): Partial<AppState> {
  if (oldWorktreeId === newWorktreeId) {
    return {}
  }
  const renamed: Record<string, unknown> = {}
  const renameKey = <T>(
    key: keyof AppState,
    mapValue: (value: T) => T = (value) => value
  ): void => {
    const map = s[key as keyof AppState] as Record<string, unknown> | undefined
    if (!map || !(oldWorktreeId in map)) {
      return
    }
    const next = { ...map }
    next[newWorktreeId] = mapValue(next[oldWorktreeId] as T)
    delete next[oldWorktreeId]
    renamed[key] = next
  }
  const withNewWorktreeId = <T extends { worktreeId: string }>(value: T): T =>
    value.worktreeId === oldWorktreeId ? { ...value, worktreeId: newWorktreeId } : value
  const renameValueByKey: Partial<Record<(typeof WORKTREE_ID_KEYED_MAP_KEYS)[number], unknown>> = {
    tabsByWorktree: (tabs: { worktreeId: string }[]) => tabs.map(withNewWorktreeId),
    browserTabsByWorktree: (workspaces: { worktreeId: string }[]) =>
      workspaces.map(withNewWorktreeId),
    unifiedTabsByWorktree: (tabs: { worktreeId: string }[]) => tabs.map(withNewWorktreeId),
    groupsByWorktree: (groups: { worktreeId: string }[]) => groups.map(withNewWorktreeId)
  }
  for (const key of WORKTREE_ID_KEYED_MAP_KEYS) {
    renameKey(key, renameValueByKey[key] as ((value: unknown) => unknown) | undefined)
  }
  // Re-key these on rename so a renamed worktree keeps its editor-undo + push/pull
  // state. (Both removal paths — buildWorktreePurgeState and the single
  // removeWorktree reducer — now also purge them on removal.)
  renameKey('recentlyClosedEditorTabsByWorktree', (files: { worktreeId: string }[]) =>
    files.map(withNewWorktreeId)
  )
  // Why: terminal reopen snapshots carry absolute startupCwd paths under the
  // old worktree folder; remap them or Cmd+Shift+T respawns into a directory
  // that no longer exists after the rename. Paths outside the renamed folder
  // are untouched by the move and stay valid as-is.
  const oldWorktreePath = splitWorktreeIdForFilesystem(oldWorktreeId)?.worktreePath
  const newWorktreePath = splitWorktreeIdForFilesystem(newWorktreeId)?.worktreePath
  renameKey('recentlyClosedTerminalTabsByWorktree', (snapshots: ClosedTerminalTabSnapshot[]) =>
    oldWorktreePath && newWorktreePath
      ? remapClosedTerminalTabSnapshotCwds(snapshots, oldWorktreePath, newWorktreePath)
      : snapshots
  )
  renameKey('remoteStatusesByWorktree')

  const openFiles = s.openFiles?.some((f) => f.worktreeId === oldWorktreeId)
    ? s.openFiles.map((f) =>
        f.worktreeId === oldWorktreeId ? { ...f, worktreeId: newWorktreeId } : f
      )
    : s.openFiles
  const currentBrowserPagesByWorkspace = s.browserPagesByWorkspace ?? {}
  const browserPagesByWorkspace = Object.values(currentBrowserPagesByWorkspace).some((pages) =>
    pages.some((page) => page.worktreeId === oldWorktreeId)
  )
    ? Object.fromEntries(
        Object.entries(currentBrowserPagesByWorkspace).map(([workspaceId, pages]) => [
          workspaceId,
          pages.map(withNewWorktreeId)
        ])
      )
    : s.browserPagesByWorkspace
  let everActivated = s.everActivatedWorktreeIds
  if (everActivated.has(oldWorktreeId)) {
    everActivated = new Set(everActivated)
    everActivated.delete(oldWorktreeId)
    everActivated.add(newWorktreeId)
  }
  const pendingReconnectWorktreeIds = s.pendingReconnectWorktreeIds?.includes(oldWorktreeId)
    ? s.pendingReconnectWorktreeIds.map((id) => (id === oldWorktreeId ? newWorktreeId : id))
    : s.pendingReconnectWorktreeIds
  const currentSleepingAgentSessionsByPaneKey = s.sleepingAgentSessionsByPaneKey ?? {}
  const sleepingAgentSessionsByPaneKey = Object.values(currentSleepingAgentSessionsByPaneKey).some(
    (record) => record.worktreeId === oldWorktreeId
  )
    ? Object.fromEntries(
        Object.entries(currentSleepingAgentSessionsByPaneKey).map(([paneKey, record]) => [
          paneKey,
          record.worktreeId === oldWorktreeId ? { ...record, worktreeId: newWorktreeId } : record
        ])
      )
    : s.sleepingAgentSessionsByPaneKey

  return {
    ...(renamed as Partial<AppState>),
    ...(openFiles !== s.openFiles ? { openFiles } : {}),
    ...(browserPagesByWorkspace !== s.browserPagesByWorkspace ? { browserPagesByWorkspace } : {}),
    ...(everActivated !== s.everActivatedWorktreeIds
      ? { everActivatedWorktreeIds: everActivated }
      : {}),
    ...(pendingReconnectWorktreeIds !== s.pendingReconnectWorktreeIds
      ? { pendingReconnectWorktreeIds }
      : {}),
    ...(sleepingAgentSessionsByPaneKey !== s.sleepingAgentSessionsByPaneKey
      ? { sleepingAgentSessionsByPaneKey }
      : {}),
    ...(s.activeWorktreeId === oldWorktreeId ? { activeWorktreeId: newWorktreeId } : {}),
    // The active workspace key derives from the worktree id, so keep it in sync when the active worktree is renamed.
    ...(s.activeWorkspaceKey === worktreeWorkspaceKey(oldWorktreeId)
      ? { activeWorkspaceKey: worktreeWorkspaceKey(newWorktreeId) }
      : {}),
    ...(s.renamingWorktreeId?.worktreeId === oldWorktreeId
      ? { renamingWorktreeId: { ...s.renamingWorktreeId, worktreeId: newWorktreeId } }
      : {})
  }
}
