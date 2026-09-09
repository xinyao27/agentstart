import { parseWorkspaceKey } from '@yiru/protocol/workspace/identity'
import { forgetForegroundTerminalTabs } from '~renderer/tab-bar/foreground-terminals'
import { forgetAgentHibernationTabOutput } from '~renderer/terminal-pane/agent/hibernation-output-activity'
import { forgetAgentStartupDeliveriesForTabs } from '~renderer/terminal-pane/agent/startup-delivery-guards'
import { forgetHugeRepoWarningDismissalsForWorktrees } from '~renderer/workspace-panel/source-control/huge-repo-warning-dismissals'

import type { AppState } from '../../store/types'
import { collectWorktreePurgeTabPtyIds } from './purge-terminal-state'
import { detachedHeadAutoDerivedDisplayNames } from './refresh-model'
import { pruneHostedReviewLinkMutationGenerations } from './review-state'

export function buildWorktreePurgeState(s: AppState, worktreeIds: string[]): Partial<AppState> {
  const worktreeIdSet = new Set(worktreeIds)
  pruneHostedReviewLinkMutationGenerations(worktreeIdSet)
  // Why: every authoritative and explicit purge converges here; centralizing
  // prevents a deleted path from inheriting UI state.
  forgetHugeRepoWarningDismissalsForWorktrees(worktreeIdSet)

  // Collect every tab id (and removed file id) we are about to orphan.
  const doomedTabIds = new Set<string>()
  // Why: some terminal/agent maps are keyed by ptyId, not tabId. Collect every
  // durable wake hint too, because slept panes have already left the live index.
  const doomedPtyIds = new Set<string>()
  const doomedBrowserWorkspaceIds = new Set<string>()
  const doomedPageIds = new Set<string>()
  const removedFileIds = new Set<string>()
  for (const id of worktreeIdSet) {
    for (const tab of s.tabsByWorktree[id] ?? []) {
      doomedTabIds.add(tab.id)
      // Null-tolerant like the omit* helpers below: some callers pass partial
      // state that omits this slice; the production store always inits it to {}.
      collectWorktreePurgeTabPtyIds(s, doomedPtyIds, tab.id, tab.ptyId)
      // Why: a removed worktree's panes are gone for good, so drop their
      // hibernation output epochs from that module-level map (mirrors the
      // hosted-review prune above). A future pane mints a fresh leafId at epoch 0.
      forgetAgentHibernationTabOutput(tab.id)
    }
    for (const workspace of s.browserTabsByWorktree[id] ?? []) {
      doomedBrowserWorkspaceIds.add(workspace.id)
    }
    // Why: drop this worktree's auto-derived detached-HEAD display name so the
    // module-level map doesn't retain removed worktrees for the whole session.
    detachedHeadAutoDerivedDisplayNames.delete(id)
  }
  // Why: same rationale for the doomed tabs' foreground last-seen timestamps and
  // consumed agent-startup delivery guards — retired tab ids never recur.
  forgetForegroundTerminalTabs(doomedTabIds)
  forgetAgentStartupDeliveriesForTabs(doomedTabIds)
  // Why: the per-page browser maps are keyed by page id, not worktree/workspace id.
  // Collect every page owned by a doomed workspace so this bulk purge can evict
  // them. (The single removeWorktree path clears these via closeBrowserTab, but the
  // authoritative-scan reconcile that also reaches this reducer does not.)
  for (const workspaceId of doomedBrowserWorkspaceIds) {
    for (const page of s.browserPagesByWorkspace[workspaceId] ?? []) {
      doomedPageIds.add(page.id)
    }
  }
  for (const file of s.openFiles) {
    if (worktreeIdSet.has(file.worktreeId)) {
      removedFileIds.add(file.id)
      if (file.markdownPreviewSourceFileId) {
        removedFileIds.add(file.markdownPreviewSourceFileId)
      }
    }
  }

  const omitByWorktree = <T>(obj: Record<string, T>): Record<string, T> => {
    let changed = false
    const out = { ...obj }
    for (const id of worktreeIdSet) {
      if (id in out) {
        delete out[id]
        changed = true
      }
    }
    return changed ? out : obj
  }
  const pruneRightSidebarTabByWorktree = (): AppState['rightSidebarTabByWorktree'] => {
    const omitted = omitByWorktree(s.rightSidebarTabByWorktree)
    let changed = omitted !== s.rightSidebarTabByWorktree
    const out: AppState['rightSidebarTabByWorktree'] = {}
    for (const [id, tab] of Object.entries(omitted)) {
      if (
        tab === 'explorer' ||
        tab === 'vault' ||
        tab === 'workspaces' ||
        tab === 'source-control' ||
        tab === 'ports'
      ) {
        out[id] = tab
      } else {
        changed = true
      }
    }
    return changed ? out : omitted
  }
  const omitByTabId = <T>(obj: Record<string, T>): Record<string, T> => {
    let changed = false
    const out = { ...obj }
    for (const tabId of doomedTabIds) {
      if (tabId in out) {
        delete out[tabId]
        changed = true
      }
    }
    return changed ? out : obj
  }
  const omitByPtyId = <T>(obj: Record<string, T>): Record<string, T> => {
    let changed = false
    const out = { ...obj }
    for (const ptyId of doomedPtyIds) {
      if (ptyId in out) {
        delete out[ptyId]
        changed = true
      }
    }
    return changed ? out : obj
  }
  // Pane-scoped maps are keyed by `${tabId}:${leafId}` (stable-pane-id); tabId
  // never contains ":", so the segment before the first ":" is the owning tab.
  const omitByPaneKeyTabPrefix = <T>(obj: Record<string, T>): Record<string, T> => {
    // Null-tolerant like omitByTabId: some worktree-isolation callers omit these
    // slices entirely, and the production store always initializes them to {}.
    if (!obj) {
      return obj
    }
    let changed = false
    const out = { ...obj }
    for (const paneKey of Object.keys(obj)) {
      const sep = paneKey.indexOf(':')
      if (sep > 0 && doomedTabIds.has(paneKey.slice(0, sep))) {
        delete out[paneKey]
        changed = true
      }
    }
    return changed ? out : obj
  }
  const omitByBrowserWorkspaceId = <T>(obj: Record<string, T>): Record<string, T> => {
    let changed = false
    const out = { ...obj }
    for (const workspaceId of doomedBrowserWorkspaceIds) {
      if (workspaceId in out) {
        delete out[workspaceId]
        changed = true
      }
    }
    return changed ? out : obj
  }
  const omitByPageId = <T>(obj: Record<string, T>): Record<string, T> => {
    let changed = false
    const out = { ...obj }
    for (const pageId of doomedPageIds) {
      if (pageId in out) {
        delete out[pageId]
        changed = true
      }
    }
    return changed ? out : obj
  }
  const omitByFileId = <T>(obj: Record<string, T>): Record<string, T> => {
    let changed = false
    const out = { ...obj }
    for (const fileId of removedFileIds) {
      if (fileId in out) {
        delete out[fileId]
        changed = true
      }
    }
    return changed ? out : obj
  }

  const nextOpenFiles = s.openFiles.some((f) => worktreeIdSet.has(f.worktreeId))
    ? s.openFiles.filter((f) => !worktreeIdSet.has(f.worktreeId))
    : s.openFiles

  const removedActive = s.activeWorktreeId != null && worktreeIdSet.has(s.activeWorktreeId)
  const activeFileCleared = s.activeFileId != null && removedFileIds.has(s.activeFileId)
  const activeTabCleared = s.activeTabId != null && doomedTabIds.has(s.activeTabId)

  const nextEverActivatedWorktreeIds = (() => {
    let hit = false
    for (const id of worktreeIdSet) {
      if (s.everActivatedWorktreeIds.has(id)) {
        hit = true
        break
      }
    }
    if (!hit) {
      return s.everActivatedWorktreeIds
    }
    const next = new Set(s.everActivatedWorktreeIds)
    for (const id of worktreeIdSet) {
      next.delete(id)
    }
    return next
  })()
  const nextAgentStatusByPaneKey = omitByPaneKeyTabPrefix(s.agentStatusByPaneKey)

  return {
    // Worktree-scoped terminal/tab state
    tabsByWorktree: omitByWorktree(s.tabsByWorktree),
    terminalLayoutsByTabId: omitByTabId(s.terminalLayoutsByTabId),
    ptyIdsByTabId: omitByTabId(s.ptyIdsByTabId),
    runtimePaneTitlesByTabId: omitByTabId(s.runtimePaneTitlesByTabId),
    automaticAgentResumeClaimsByTabId: omitByTabId(s.automaticAgentResumeClaimsByTabId),
    // Why: bulk/hydration purge must drop the per-tab pane-expand flags too;
    // this path never runs terminal teardown, so nothing else evicts them.
    expandedPaneByTabId: omitByTabId(s.expandedPaneByTabId),
    canExpandPaneByTabId: omitByTabId(s.canExpandPaneByTabId),
    // Why: these per-tab / per-pty terminal+agent maps are evicted on the single
    // removeWorktree path (via closeTab / shutdownWorktreeTerminals) but this bulk
    // reconcile / remove-project / hydration-stale path runs no terminal teardown,
    // so without these lines each one strands an entry per tab/pane of every
    // externally-removed worktree for the renderer's whole session. lastKnownRelay
    // and the two ptyId maps retain an entry for a live pane's entire lifetime
    // (highest value); the pending* one-shots are consumed at pane mount so usually
    // already empty at removal, but strand when a tab's pane never mounted.
    lastKnownRelayPtyIdByTabId: omitByTabId(s.lastKnownRelayPtyIdByTabId),
    pendingInitialCwdByTabId: omitByTabId(s.pendingInitialCwdByTabId),
    pendingSetupSplitByTabId: omitByTabId(s.pendingSetupSplitByTabId),
    pendingStartupByTabId: omitByTabId(s.pendingStartupByTabId),
    codexRestartNoticeByPtyId: omitByPtyId(s.codexRestartNoticeByPtyId),
    migrationUnsupportedByPtyId: omitByPtyId(s.migrationUnsupportedByPtyId),
    suppressedPtyExitIds: omitByPtyId(s.suppressedPtyExitIds),
    pendingCodexPaneRestartIds: omitByPtyId(s.pendingCodexPaneRestartIds),
    // Why: these tab/pane-scoped agent-status, unread, and input maps are only
    // cleared on the single removeWorktree path (via shutdownWorktreeTerminals /
    // dropAgentStatusByWorktree / clearPaneForegroundAgentByWorktree, which read
    // tabsByWorktree while it is still populated). The bulk reconcile / remove-
    // project / hydration-stale paths that reach this reducer never run terminal
    // teardown, so without this they orphan an entry per agent pane of every
    // externally-removed worktree for the session (plus a phantom unread dock
    // badge). retainedAgentsByPaneKey and runtimeAgentOrchestrationByPaneKey are
    // intentionally omitted here — both self-heal (pruneRetainedAgents on a
    // worktreesByRepo change; the runtime map is replaced wholesale each sync).
    agentStatusByPaneKey: nextAgentStatusByPaneKey,
    ...(nextAgentStatusByPaneKey !== s.agentStatusByPaneKey
      ? { agentStatusEpoch: s.agentStatusEpoch + 1 }
      : {}),
    agentLaunchConfigByPaneKey: omitByPaneKeyTabPrefix(s.agentLaunchConfigByPaneKey),
    acknowledgedAgentsByPaneKey: omitByPaneKeyTabPrefix(s.acknowledgedAgentsByPaneKey),
    paneForegroundAgentByPaneKey: omitByPaneKeyTabPrefix(s.paneForegroundAgentByPaneKey),
    sleepingAgentSessionsByPaneKey: omitByPaneKeyTabPrefix(s.sleepingAgentSessionsByPaneKey),
    unreadTerminalTabs: omitByTabId(s.unreadTerminalTabs),
    unreadTerminalPanes: omitByPaneKeyTabPrefix(s.unreadTerminalPanes),
    unreadAgentCompletionPanes: omitByPaneKeyTabPrefix(s.unreadAgentCompletionPanes),
    lastTerminalInputAtByPaneKey: omitByPaneKeyTabPrefix(s.lastTerminalInputAtByPaneKey),
    // Delete state
    deleteStateByWorktreeId: omitByWorktree(s.deleteStateByWorktreeId),
    baseStatusByWorktreeId: omitByWorktree(s.baseStatusByWorktreeId),
    // File search
    fileSearchStateByWorktree: omitByWorktree(s.fileSearchStateByWorktree),
    // Browser state
    browserTabsByWorktree: omitByWorktree(s.browserTabsByWorktree),
    browserPagesByWorkspace: omitByBrowserWorkspaceId(s.browserPagesByWorkspace),
    activeBrowserTabIdByWorktree: omitByWorktree(s.activeBrowserTabIdByWorktree),
    // Why: these browser maps are keyed by page/workspace id and were only cleaned
    // on the single-worktree removal path (closeBrowserTab); this bulk reconcile path
    // missed them, orphaning a handle entry per page of
    // every externally-removed worktree for the session.
    remoteBrowserPageHandlesByPageId: omitByPageId(s.remoteBrowserPageHandlesByPageId),
    // Editor state
    activeFileIdByWorktree: omitByWorktree(s.activeFileIdByWorktree),
    activeTabTypeByWorktree: omitByWorktree(s.activeTabTypeByWorktree),
    activeTabIdByWorktree: omitByWorktree(s.activeTabIdByWorktree),
    tabBarOrderByWorktree: omitByWorktree(s.tabBarOrderByWorktree),
    pendingReconnectTabByWorktree: omitByWorktree(s.pendingReconnectTabByWorktree),
    rightSidebarTabByWorktree: pruneRightSidebarTabByWorktree(),
    rightSidebarExplorerViewByWorktree: omitByWorktree(s.rightSidebarExplorerViewByWorktree ?? {}),
    sourceControlPanelViewByWorktree: omitByWorktree(s.sourceControlPanelViewByWorktree),
    gitGraphByWorktree: omitByWorktree(s.gitGraphByWorktree),
    gitGraphIncludeRemoteBranchesByWorktree: omitByWorktree(
      s.gitGraphIncludeRemoteBranchesByWorktree
    ),
    gitGraphSelectedRefIdsByWorktree: omitByWorktree(s.gitGraphSelectedRefIdsByWorktree),
    gitGraphColumnWidthsByWorktree: omitByWorktree(s.gitGraphColumnWidthsByWorktree),
    // Split-tab / unified tab state
    unifiedTabsByWorktree: omitByWorktree(s.unifiedTabsByWorktree),
    groupsByWorktree: omitByWorktree(s.groupsByWorktree),
    layoutByWorktree: omitByWorktree(s.layoutByWorktree),
    activeGroupIdByWorktree: omitByWorktree(s.activeGroupIdByWorktree),
    // Git status caches
    gitStatusByWorktree: omitByWorktree(s.gitStatusByWorktree),
    // Why: keyed by worktreeId; re-keyed on rename but missed by both removal
    // paths, leaking an upstream-status entry per removed worktree.
    remoteStatusesByWorktree: omitByWorktree(s.remoteStatusesByWorktree),
    gitStatusHeadByWorktree: omitByWorktree(s.gitStatusHeadByWorktree),
    gitIgnoredPathsByWorktree: omitByWorktree(s.gitIgnoredPathsByWorktree),
    gitConflictOperationByWorktree: omitByWorktree(s.gitConflictOperationByWorktree),
    trackedConflictPathsByWorktree: omitByWorktree(s.trackedConflictPathsByWorktree),
    gitBranchChangesByWorktree: omitByWorktree(s.gitBranchChangesByWorktree),
    gitBranchCompareSummaryByWorktree: omitByWorktree(s.gitBranchCompareSummaryByWorktree),
    gitBranchCompareRequestKeyByWorktree: omitByWorktree(s.gitBranchCompareRequestKeyByWorktree),
    gitBranchCompareRequestStatusHeadByWorktree: omitByWorktree(
      s.gitBranchCompareRequestStatusHeadByWorktree
    ),
    // Why: keyed by worktreeId; without this it leaks a huge-status marker per
    // removed worktree for the rest of the session.
    gitStatusHugeByWorktree: omitByWorktree(s.gitStatusHugeByWorktree),
    showDotfilesByWorktree: omitByWorktree(s.showDotfilesByWorktree),
    expandedDirs: omitByWorktree(s.expandedDirs),
    // Per-file editor state for removed files
    editorDrafts: omitByFileId(s.editorDrafts),
    markdownViewMode: omitByFileId(s.markdownViewMode),
    markdownFrontmatterVisible: omitByFileId(s.markdownFrontmatterVisible),
    // Why: keyed by fileId; the bulk reconcile path previously kept these,
    // leaking a cursor-line / view-mode entry per file of every removed worktree.
    editorCursorLine: omitByFileId(s.editorCursorLine),
    editorViewMode: omitByFileId(s.editorViewMode),
    // Why: keyed by worktreeId; re-keyed on rename but missed by both removal
    // paths, leaking the per-worktree editor-undo (Cmd/Ctrl+Shift+T) snapshots.
    recentlyClosedEditorTabsByWorktree: omitByWorktree(s.recentlyClosedEditorTabsByWorktree),
    recentlyClosedTerminalTabsByWorktree: omitByWorktree(s.recentlyClosedTerminalTabsByWorktree),
    recentlyClosedTabKindsByWorktree: omitByWorktree(s.recentlyClosedTabKindsByWorktree),
    // Top-level actives
    openFiles: nextOpenFiles,
    everActivatedWorktreeIds: nextEverActivatedWorktreeIds,
    lastVisitedAtByWorktreeId: omitByWorktree(s.lastVisitedAtByWorktreeId),
    // Why: keyed by worktreeId; the write-once default-terminal idempotency guard
    // was re-keyed on rename but missed by both removal paths.
    defaultTerminalTabsAppliedByWorktreeId: omitByWorktree(
      s.defaultTerminalTabsAppliedByWorktreeId
    ),
    activeWorktreeId: removedActive ? null : s.activeWorktreeId,
    activeWorkspaceKey: (() => {
      if (s.activeWorkspaceKey && worktreeIdSet.has(s.activeWorkspaceKey)) {
        return null
      }
      const activeScope = s.activeWorkspaceKey ? parseWorkspaceKey(s.activeWorkspaceKey) : null
      return activeScope?.type === 'worktree' && worktreeIdSet.has(activeScope.worktreeId)
        ? null
        : s.activeWorkspaceKey
    })(),
    activeFileId: activeFileCleared ? null : s.activeFileId,
    activeBrowserTabId: removedActive ? null : s.activeBrowserTabId,
    activeTabId: activeTabCleared ? null : s.activeTabId,
    activeTabType: removedActive || activeFileCleared ? 'terminal' : s.activeTabType
  }
}
