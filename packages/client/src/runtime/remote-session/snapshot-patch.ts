import { sameStringArray } from './agent-status-equality'
import {
  appendTabGroupLayout,
  collectLayoutGroupIds,
  pruneTabGroupLayout,
  tabGroupLayoutEqual
} from './group-mirror'
import type { buildRemoteSessionGroupReconciliation } from './group-reconciliation'
import type { buildRemoteSessionResourceReconciliation } from './resource-reconciliation'
import type { resolveRemoteSessionSnapshotSelection } from './selection-reconciliation'
import type { RuntimeMobileSessionTabsResult } from './session-model'
import {
  sameBrowserTabs,
  sameGroups,
  sameTerminalTabs,
  sameUnifiedTabs,
  toVisibleTabType,
  withWorktreeEntry
} from './store-equality'
import type { buildRemoteSessionSurfaceMirror } from './surface-reconciliation'
import type { RemoteSessionTabsSyncState } from './tabs-state'
import { buildMirroredAgentStatusPatch } from './terminal-mirror'

export function buildRemoteSessionSnapshotPatch(input: {
  state: RemoteSessionTabsSyncState
  snapshot: RuntimeMobileSessionTabsResult
  worktreeId: string
  now: number
  honorSnapshotActiveFocus: boolean
  surfaceMirror: ReturnType<typeof buildRemoteSessionSurfaceMirror>
  selection: ReturnType<typeof resolveRemoteSessionSnapshotSelection>
  groupMirror: ReturnType<typeof buildRemoteSessionGroupReconciliation>
  resources: ReturnType<typeof buildRemoteSessionResourceReconciliation>
}): RemoteSessionTabsSyncState | Partial<RemoteSessionTabsSyncState> {
  const {
    state,
    snapshot,
    worktreeId,
    now,
    honorSnapshotActiveFocus,
    surfaceMirror,
    selection,
    groupMirror,
    resources
  } = input
  const {
    currentTerminalTabs,
    terminalSurfaceTabs,
    nextTerminalTabs,
    targetGroupId,
    nextBrowserTabs,
    nextOpenFiles,
    nextUnifiedTabs
  } = surfaceMirror
  const {
    currentActiveTerminalStillExists,
    nextActiveTerminalId,
    currentActiveBrowserStillExists,
    nextActiveBrowserWorkspaceId,
    currentActiveEditorStillExists,
    nextActiveEditorFileId,
    nextActiveUnifiedTabId
  } = selection
  const { nextGroups, nextTabBarOrder } = groupMirror
  const {
    nextPtyIdsByTabId,
    nextTerminalLayoutsByTabId,
    nextUnreadTerminalTabs,
    nextBrowserPagesByWorkspace,
    nextRemoteBrowserPageHandlesByPageId,
    nextBrowserCertificateFailuresByPageId
  } = resources
  const nextTabsByWorktree = withWorktreeEntry(
    state.tabsByWorktree,
    worktreeId,
    nextTerminalTabs,
    sameTerminalTabs
  )
  const nextBrowserTabsByWorktree = withWorktreeEntry(
    state.browserTabsByWorktree,
    worktreeId,
    nextBrowserTabs,
    sameBrowserTabs
  )
  const nextUnifiedTabsByWorktree = withWorktreeEntry(
    state.unifiedTabsByWorktree,
    worktreeId,
    nextUnifiedTabs,
    sameUnifiedTabs
  )
  const nextGroupsByWorktree = withWorktreeEntry(
    state.groupsByWorktree,
    worktreeId,
    nextGroups,
    sameGroups
  )
  const nextActiveGroupId =
    // Why: remote status/title snapshots carry the host's last active tab; a
    // client that already switched panes must keep its local group focus.
    nextGroups?.find((group) => group.activeTabId === nextActiveUnifiedTabId)?.id ??
    nextGroups?.find((group) => group.id === snapshot.activeGroupId)?.id ??
    nextGroups?.[0]?.id ??
    null
  const nextActiveGroupIdByWorktree =
    nextGroups && state.activeGroupIdByWorktree[worktreeId] !== nextActiveGroupId
      ? { ...state.activeGroupIdByWorktree, [worktreeId]: nextActiveGroupId ?? targetGroupId }
      : state.activeGroupIdByWorktree
  const nextLayoutByWorktree = (() => {
    if (!nextGroups) {
      return state.layoutByWorktree
    }
    const validGroupIds = new Set(nextGroups.map((group) => group.id))
    const hostLayout = pruneTabGroupLayout(snapshot.tabGroupLayout, validGroupIds)
    const defaultLeafLayout = { type: 'leaf' as const, groupId: nextActiveGroupId ?? targetGroupId }
    const hostLayoutGroupIds = collectLayoutGroupIds(hostLayout ?? undefined)
    const hostGroupIds = new Set(snapshot.tabGroups?.map((group) => group.id) ?? [])
    const extraGroupIds = new Set(
      nextGroups
        .map((group) => group.id)
        .filter((groupId) =>
          hostLayout
            ? !hostLayoutGroupIds.has(groupId)
            : snapshot.tabGroups && snapshot.tabGroups.length > 0
              ? !hostGroupIds.has(groupId)
              : false
        )
    )
    const localExtraLayout = pruneTabGroupLayout(state.layoutByWorktree[worktreeId], extraGroupIds)
    const hostBaseLayout =
      hostLayout ?? (snapshot.tabGroups && snapshot.tabGroups.length > 0 ? defaultLeafLayout : null)
    const fallbackLayout =
      appendTabGroupLayout(hostBaseLayout, localExtraLayout) ??
      (snapshot.tabGroups && snapshot.tabGroups.length > 0
        ? defaultLeafLayout
        : state.layoutByWorktree[worktreeId]
          ? null
          : defaultLeafLayout)
    if (!fallbackLayout) {
      return state.layoutByWorktree
    }
    if (tabGroupLayoutEqual(state.layoutByWorktree[worktreeId], fallbackLayout)) {
      return state.layoutByWorktree
    }
    return {
      ...state.layoutByWorktree,
      [worktreeId]: fallbackLayout
    }
  })()
  const nextTabBarOrderByWorktree = withWorktreeEntry(
    state.tabBarOrderByWorktree,
    worktreeId,
    nextTabBarOrder.length > 0 ? nextTabBarOrder : null,
    (a, b) => sameStringArray(a ?? [], b ?? [])
  )
  const nextActiveTabIdByWorktree =
    (state.activeTabIdByWorktree[worktreeId] ?? null) !== nextActiveTerminalId
      ? { ...state.activeTabIdByWorktree, [worktreeId]: nextActiveTerminalId }
      : state.activeTabIdByWorktree
  const nextActiveBrowserTabIdByWorktree =
    (state.activeBrowserTabIdByWorktree[worktreeId] ?? null) !== nextActiveBrowserWorkspaceId
      ? { ...state.activeBrowserTabIdByWorktree, [worktreeId]: nextActiveBrowserWorkspaceId }
      : state.activeBrowserTabIdByWorktree
  const nextActiveFileIdByWorktree =
    (state.activeFileIdByWorktree[worktreeId] ?? null) !== nextActiveEditorFileId
      ? { ...state.activeFileIdByWorktree, [worktreeId]: nextActiveEditorFileId }
      : state.activeFileIdByWorktree
  const isActiveWorktree = state.activeWorktreeId === worktreeId
  const snapshotVisibleTabType =
    snapshot.activeTabType === 'browser' && nextActiveBrowserWorkspaceId
      ? ('browser' as const)
      : snapshot.activeTabType === 'terminal' && nextActiveTerminalId
        ? ('terminal' as const)
        : (snapshot.activeTabType === 'markdown' || snapshot.activeTabType === 'file') &&
            nextActiveEditorFileId
          ? ('editor' as const)
          : null
  const currentVisibleTabType =
    state.activeTabTypeByWorktree[worktreeId] ?? (isActiveWorktree ? state.activeTabType : null)
  const currentVisibleTabTypeStillValid =
    currentVisibleTabType === 'browser' && currentActiveBrowserStillExists
      ? ('browser' as const)
      : currentVisibleTabType === 'editor' && currentActiveEditorStillExists
        ? ('editor' as const)
        : currentVisibleTabType === 'terminal' && currentActiveTerminalStillExists
          ? ('terminal' as const)
          : null
  const activeUnifiedTab =
    nextActiveUnifiedTabId && nextUnifiedTabs
      ? (nextUnifiedTabs.find((tab) => tab.id === nextActiveUnifiedTabId) ?? null)
      : null
  const fallbackVisibleTabType =
    activeUnifiedTab !== null
      ? toVisibleTabType(activeUnifiedTab)
      : nextActiveTerminalId
        ? ('terminal' as const)
        : nextActiveBrowserWorkspaceId
          ? ('browser' as const)
          : nextActiveEditorFileId
            ? ('editor' as const)
            : ('terminal' as const)
  // Why: an empty/closed host snapshot has no active host tab, but the web
  // client must not keep pointing global shortcuts at a removed browser/editor.
  // A client-initiated activation (honorSnapshotActiveFocus) makes the snapshot's
  // type win, so a create can switch the visible pane (e.g. terminal -> browser).
  const nextVisibleTabType = honorSnapshotActiveFocus
    ? (snapshotVisibleTabType ?? currentVisibleTabTypeStillValid ?? fallbackVisibleTabType)
    : (currentVisibleTabTypeStillValid ?? snapshotVisibleTabType ?? fallbackVisibleTabType)
  const currentActiveTerminalStillValid =
    state.activeTabId && (nextTerminalTabs ?? []).some((tab) => tab.id === state.activeTabId)
      ? state.activeTabId
      : null
  const currentActiveEditorStillValid =
    state.activeFileId &&
    nextOpenFiles.some((file) => file.worktreeId === worktreeId && file.id === state.activeFileId)
      ? state.activeFileId
      : null
  const nextActiveTabId = isActiveWorktree
    ? snapshot.activeTabType === 'terminal'
      ? nextActiveTerminalId
      : (currentActiveTerminalStillValid ?? nextActiveTerminalId)
    : state.activeTabId
  const nextActiveBrowserTabId = isActiveWorktree
    ? nextActiveBrowserWorkspaceId
    : state.activeBrowserTabId
  const nextActiveFileId = isActiveWorktree
    ? snapshot.activeTabType === 'markdown' || snapshot.activeTabType === 'file'
      ? nextActiveEditorFileId
      : (currentActiveEditorStillValid ?? nextActiveEditorFileId)
    : state.activeFileId
  const nextActiveTabType = isActiveWorktree ? nextVisibleTabType : state.activeTabType
  const nextActiveTabTypeByWorktree =
    state.activeTabTypeByWorktree[worktreeId] !== nextVisibleTabType
      ? { ...state.activeTabTypeByWorktree, [worktreeId]: nextVisibleTabType }
      : state.activeTabTypeByWorktree
  const agentStatusPatch = buildMirroredAgentStatusPatch(
    state,
    currentTerminalTabs,
    terminalSurfaceTabs,
    now
  )
  const patch: Partial<RemoteSessionTabsSyncState> = {
    ...agentStatusPatch,
    ...(nextOpenFiles !== state.openFiles ? { openFiles: nextOpenFiles } : {}),
    ...(nextTabsByWorktree !== state.tabsByWorktree ? { tabsByWorktree: nextTabsByWorktree } : {}),
    ...(nextBrowserTabsByWorktree !== state.browserTabsByWorktree
      ? { browserTabsByWorktree: nextBrowserTabsByWorktree }
      : {}),
    ...(nextUnifiedTabsByWorktree !== state.unifiedTabsByWorktree
      ? { unifiedTabsByWorktree: nextUnifiedTabsByWorktree }
      : {}),
    ...(nextGroupsByWorktree !== state.groupsByWorktree
      ? { groupsByWorktree: nextGroupsByWorktree }
      : {}),
    ...(nextActiveGroupIdByWorktree !== state.activeGroupIdByWorktree
      ? { activeGroupIdByWorktree: nextActiveGroupIdByWorktree }
      : {}),
    ...(nextLayoutByWorktree !== state.layoutByWorktree
      ? { layoutByWorktree: nextLayoutByWorktree }
      : {}),
    ...(nextTabBarOrderByWorktree !== state.tabBarOrderByWorktree
      ? { tabBarOrderByWorktree: nextTabBarOrderByWorktree }
      : {}),
    ...(nextPtyIdsByTabId !== state.ptyIdsByTabId ? { ptyIdsByTabId: nextPtyIdsByTabId } : {}),
    ...(nextTerminalLayoutsByTabId !== state.terminalLayoutsByTabId
      ? { terminalLayoutsByTabId: nextTerminalLayoutsByTabId }
      : {}),
    ...(nextUnreadTerminalTabs !== state.unreadTerminalTabs
      ? { unreadTerminalTabs: nextUnreadTerminalTabs }
      : {}),
    ...(nextBrowserPagesByWorkspace !== state.browserPagesByWorkspace
      ? { browserPagesByWorkspace: nextBrowserPagesByWorkspace }
      : {}),
    ...(nextRemoteBrowserPageHandlesByPageId !== state.remoteBrowserPageHandlesByPageId
      ? { remoteBrowserPageHandlesByPageId: nextRemoteBrowserPageHandlesByPageId }
      : {}),
    ...(nextBrowserCertificateFailuresByPageId !== state.browserCertificateFailuresByPageId
      ? { browserCertificateFailuresByPageId: nextBrowserCertificateFailuresByPageId }
      : {}),
    ...(nextActiveTabIdByWorktree !== state.activeTabIdByWorktree
      ? { activeTabIdByWorktree: nextActiveTabIdByWorktree }
      : {}),
    ...(nextActiveBrowserTabIdByWorktree !== state.activeBrowserTabIdByWorktree
      ? { activeBrowserTabIdByWorktree: nextActiveBrowserTabIdByWorktree }
      : {}),
    ...(nextActiveFileIdByWorktree !== state.activeFileIdByWorktree
      ? { activeFileIdByWorktree: nextActiveFileIdByWorktree }
      : {}),
    ...(nextActiveTabId !== state.activeTabId ? { activeTabId: nextActiveTabId } : {}),
    ...(nextActiveBrowserTabId !== state.activeBrowserTabId
      ? { activeBrowserTabId: nextActiveBrowserTabId }
      : {}),
    ...(nextActiveFileId !== state.activeFileId ? { activeFileId: nextActiveFileId } : {}),
    ...(nextActiveTabType !== state.activeTabType ? { activeTabType: nextActiveTabType } : {}),
    ...(nextActiveTabTypeByWorktree !== state.activeTabTypeByWorktree
      ? { activeTabTypeByWorktree: nextActiveTabTypeByWorktree }
      : {})
  }
  return Object.keys(patch).length === 0 ? state : patch
}
