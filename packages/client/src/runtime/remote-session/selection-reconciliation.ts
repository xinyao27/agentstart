import { toRemoteTerminalSurfaceTabId } from '../remote-terminal-surface-id'
import { buildHostToLocalTabIdMap, updateHostSessionTabIdMappings } from './group-mirror'
import type { RuntimeMobileSessionTabsResult } from './session-model'
import { findCurrentVisibleUnifiedTabId } from './store-equality'
import type { buildRemoteSessionSurfaceMirror } from './surface-reconciliation'
import type { RemoteSessionTabsSyncState } from './tabs-state'

export function resolveRemoteSessionSnapshotSelection(input: {
  state: RemoteSessionTabsSyncState
  snapshot: RuntimeMobileSessionTabsResult
  environmentId: string
  worktreeId: string
  honorSnapshotActiveFocus: boolean
  surfaceMirror: ReturnType<typeof buildRemoteSessionSurfaceMirror>
}) {
  const { state, snapshot, environmentId, worktreeId, honorSnapshotActiveFocus, surfaceMirror } =
    input
  const {
    terminalSurfaceTabs,
    mirroredTerminalTabEntries,
    nextTerminalTabs,
    readyBrowserTabs,
    mirroredBrowserTabs,
    nextBrowserTabs,
    readyEditorTabs,
    mirroredEditorTabs,
    nextOpenFiles,
    mirroredUnifiedTabs,
    nextUnifiedTabs
  } = surfaceMirror
  const validUnifiedTabIds = new Set(nextUnifiedTabs?.map((tab) => tab.id) ?? [])
  const activeHostTerminalId =
    terminalSurfaceTabs.find((tab) => tab.id === snapshot.activeTabId)?.id ??
    terminalSurfaceTabs.find((tab) => tab.isActive)?.id ??
    null
  const activeHostTerminalParentId =
    terminalSurfaceTabs.find((tab) => tab.id === activeHostTerminalId)?.parentTabId ??
    terminalSurfaceTabs.find((tab) => tab.isActive)?.parentTabId ??
    null
  const activeMirroredTerminalId = activeHostTerminalId
    ? toRemoteTerminalSurfaceTabId(activeHostTerminalParentId ?? activeHostTerminalId)
    : null
  const activeHostBrowser =
    readyBrowserTabs.find((tab) => tab.id === snapshot.activeTabId) ??
    readyBrowserTabs.find((tab) => tab.isActive) ??
    null
  const activeMirroredBrowser = activeHostBrowser
    ? (mirroredBrowserTabs.find(
        (entry) => entry.remotePageId === activeHostBrowser.browserPageId
      ) ?? null)
    : null
  const activeMirroredBrowserTabId = activeMirroredBrowser?.unifiedTab.id ?? null
  const activeMirroredBrowserWorkspaceId = activeMirroredBrowser?.workspace.id ?? null
  const activeHostEditor =
    readyEditorTabs.find((tab) => tab.id === snapshot.activeTabId) ??
    readyEditorTabs.find((tab) => tab.isActive) ??
    null
  const activeMirroredEditor = activeHostEditor
    ? (mirroredEditorTabs.find((entry) => entry.hostTabId === activeHostEditor.id) ?? null)
    : null
  const activeMirroredEditorFileId = activeMirroredEditor?.file.id ?? null
  const activeMirroredEditorTabId = activeMirroredEditor?.unifiedTab.id ?? null
  const currentActiveTerminalStillExists =
    state.activeTabIdByWorktree[worktreeId] &&
    (nextTerminalTabs ?? []).some((tab) => tab.id === state.activeTabIdByWorktree[worktreeId])
      ? state.activeTabIdByWorktree[worktreeId]
      : null
  // Why: when the client initiated this activation (honorSnapshotActiveFocus),
  // the snapshot's active terminal wins over the sticky current focus.
  const intentTerminalId =
    honorSnapshotActiveFocus && snapshot.activeTabType === 'terminal'
      ? activeMirroredTerminalId
      : null
  const nextActiveTerminalId =
    intentTerminalId ??
    currentActiveTerminalStillExists ??
    (snapshot.activeTabType === 'terminal'
      ? (activeMirroredTerminalId ?? mirroredTerminalTabEntries[0]?.id)
      : mirroredTerminalTabEntries[0]?.id) ??
    null
  const currentActiveBrowserStillExists =
    state.activeBrowserTabIdByWorktree[worktreeId] &&
    (nextBrowserTabs ?? []).some((tab) => tab.id === state.activeBrowserTabIdByWorktree[worktreeId])
      ? state.activeBrowserTabIdByWorktree[worktreeId]
      : null
  const intentBrowserWorkspaceId =
    honorSnapshotActiveFocus && snapshot.activeTabType === 'browser'
      ? activeMirroredBrowserWorkspaceId
      : null
  const nextActiveBrowserWorkspaceId =
    intentBrowserWorkspaceId ??
    currentActiveBrowserStillExists ??
    (snapshot.activeTabType === 'browser'
      ? (activeMirroredBrowserWorkspaceId ?? mirroredBrowserTabs[0]?.workspace.id)
      : mirroredBrowserTabs[0]?.workspace.id) ??
    null
  const currentActiveEditorStillExists =
    state.activeFileIdByWorktree[worktreeId] &&
    nextOpenFiles.some(
      (file) =>
        file.worktreeId === worktreeId && file.id === state.activeFileIdByWorktree[worktreeId]
    )
      ? state.activeFileIdByWorktree[worktreeId]
      : null
  const nextActiveEditorFileId =
    currentActiveEditorStillExists ??
    (snapshot.activeTabType === 'markdown' || snapshot.activeTabType === 'file'
      ? (activeMirroredEditorFileId ?? mirroredEditorTabs[0]?.file.id)
      : mirroredEditorTabs[0]?.file.id) ??
    null
  const currentVisibleUnifiedTabId = findCurrentVisibleUnifiedTabId({
    state,
    worktreeId,
    nextUnifiedTabs
  })
  // Why: a client-initiated activation also drives the visible unified tab,
  // overriding the sticky current-visible tab.
  const intentUnifiedTabId = honorSnapshotActiveFocus
    ? snapshot.activeTabType === 'browser'
      ? activeMirroredBrowserTabId
      : snapshot.activeTabType === 'terminal'
        ? intentTerminalId
        : snapshot.activeTabType === 'markdown' || snapshot.activeTabType === 'file'
          ? activeMirroredEditorTabId
          : null
    : null
  const nextActiveUnifiedTabId =
    intentUnifiedTabId ??
    currentVisibleUnifiedTabId ??
    (snapshot.activeTabType === 'browser'
      ? (activeMirroredBrowserTabId ??
        mirroredBrowserTabs[0]?.unifiedTab.id ??
        state.activeTabIdByWorktree[worktreeId] ??
        nextActiveTerminalId)
      : snapshot.activeTabType === 'markdown' || snapshot.activeTabType === 'file'
        ? (activeMirroredEditorTabId ??
          mirroredEditorTabs[0]?.unifiedTab.id ??
          state.activeTabIdByWorktree[worktreeId] ??
          nextActiveTerminalId)
        : nextActiveTerminalId)
  const mirroredUnifiedIds = new Set(mirroredUnifiedTabs.map((tab) => tab.id))
  const hostToLocalTabId = buildHostToLocalTabIdMap({
    terminalSurfaces: terminalSurfaceTabs,
    terminalTabs: mirroredTerminalTabEntries,
    browserTabs: mirroredBrowserTabs,
    editorTabs: mirroredEditorTabs
  })
  updateHostSessionTabIdMappings({
    environmentId,
    worktreeId,
    terminalSurfaces: terminalSurfaceTabs,
    terminalTabs: mirroredTerminalTabEntries,
    browserTabs: mirroredBrowserTabs,
    editorTabs: mirroredEditorTabs
  })
  return {
    validUnifiedTabIds,
    activeHostTerminalId,
    activeHostTerminalParentId,
    activeMirroredTerminalId,
    activeHostBrowser,
    activeMirroredBrowser,
    activeMirroredBrowserTabId,
    activeMirroredBrowserWorkspaceId,
    activeHostEditor,
    activeMirroredEditor,
    activeMirroredEditorFileId,
    activeMirroredEditorTabId,
    currentActiveTerminalStillExists,
    intentTerminalId,
    nextActiveTerminalId,
    currentActiveBrowserStillExists,
    intentBrowserWorkspaceId,
    nextActiveBrowserWorkspaceId,
    currentActiveEditorStillExists,
    nextActiveEditorFileId,
    currentVisibleUnifiedTabId,
    intentUnifiedTabId,
    nextActiveUnifiedTabId,
    mirroredUnifiedIds,
    hostToLocalTabId
  }
}
