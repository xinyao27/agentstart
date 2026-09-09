import { hasFeatureInteraction } from '@yiru/protocol/telemetry/interactions/state'
import { folderWorkspaceKey } from '@yiru/protocol/workspace/identity'
import React, { useEffect } from 'react'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useAppStore } from '~renderer/store/state'
import { setForegroundTerminalTabIds } from '~renderer/tab-bar/foreground-terminals'
import { cn } from '~renderer/ui/class-names'

import { useContextualTour } from '../contextual-tours/use-contextual-tour'
import EditorAutosaveController from '../editor/autosave-controller-host'
import { TAB_CONTENT_SURFACE_CLASSES } from '../tab-bar/tab-chrome-classes'
import { resolveRepairedActiveTerminalTabId } from './active-terminal-repair'
import { useEditorCloseQueue } from './editor-close-queue'
import { useTerminalWorkspaceKeyboardShortcuts } from './keyboard-shortcuts'
import { LegacyWorkspaceSurfaces } from './legacy-workspace-surfaces'
import { SaveConfirmationDialog } from './save-confirmation-dialog'
import { getEffectiveLayoutForWorktree as getEffectiveLayout } from './split-group-mount'
import { useTabCloseActions } from './tab-close-actions'
import { useTabCreateActions } from './tab-create-actions'
import { useTerminalColdParking } from './terminal-cold-parking'
import { useTerminalWorktreeMounting } from './terminal-worktree-mounting'
import { useTerminalProviderSnapshotCapability } from './use-terminal-provider-snapshot-capability'
import { useWorktreeActivationBootstrap } from './worktree-activation-bootstrap'
import { WorktreeSplitSurface } from './worktree-split-surface'

// Why: the workspace panel owns the top-level terminal/editor/browser surface
// for the active worktree, plus the tab bar portal that renders into the
// titlebar. Its lifecycle concerns (worktree mounting, tab actions, keyboard
// shortcuts, and editor-close guarding) are split into sibling hooks in this
// folder; this file only composes them and renders the surface.
function TerminalWorkspacePanel(): React.JSX.Element | null {
  const { allWorktrees, folderWorkspaces } = useProjectCatalog()
  const workspaceSurfaces = (() => [
    ...allWorktrees.map((worktree) => ({ id: worktree.id, path: worktree.path })),
    ...folderWorkspaces.map((workspace) => ({
      id: folderWorkspaceKey(workspace.id),
      path: workspace.folderPath
    }))
  ])()
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const activeView = useAppStore((s) => s.activeView)
  const tabsByWorktree = useAppStore((s) => s.tabsByWorktree)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const activeTabIdByWorktree = useAppStore((s) => s.activeTabIdByWorktree)
  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const workspaceSessionReady = useAppStore((s) => s.workspaceSessionReady)
  const hydrationSucceeded = useAppStore((s) => s.hydrationSucceeded)
  const openFiles = useAppStore((s) => s.openFiles)
  const activeBrowserTabId = useAppStore((s) => s.activeBrowserTabId)
  const activeTabType = useAppStore((s) => s.activeTabType)
  const setActiveTabType = useAppStore((s) => s.setActiveTabType)
  const browserTabsByWorktree = useAppStore((s) => s.browserTabsByWorktree)
  const setActiveBrowserTab = useAppStore((s) => s.setActiveBrowserTab)
  const groupsByWorktree = useAppStore((s) => s.groupsByWorktree)
  const layoutByWorktree = useAppStore((s) => s.layoutByWorktree)
  const activeGroupIdByWorktree = useAppStore((s) => s.activeGroupIdByWorktree)
  const ensureWorktreeRootGroup = useAppStore((s) => s.ensureWorktreeRootGroup)

  const foregroundTerminalTabIds = (() => {
    const ids = new Set<string>()
    if (activeView === 'terminal' && activeTabType === 'terminal' && activeTabId) {
      ids.add(activeTabId)
    }
    return Array.from(ids)
  })()

  useEffect(() => {
    // Why: hibernation treats the visible terminal as foreground authority.
    setForegroundTerminalTabIds(foregroundTerminalTabIds)
    return () => setForegroundTerminalTabIds([])
  }, [foregroundTerminalTabIds])

  const tabs = (() => (activeWorktreeId ? (tabsByWorktree[activeWorktreeId] ?? []) : []))()
  useTerminalProviderSnapshotCapability(workspaceSessionReady && hydrationSucceeded)

  useEffect(() => {
    if (!activeWorktreeId) {
      return
    }
    // Why: split-group ownership is now the real path. Ensure the active
    // worktree always has a root group so terminal-first fallback can attach
    // fresh tabs to a concrete owner even before any explicit split exists.
    ensureWorktreeRootGroup(activeWorktreeId)
  }, [activeWorktreeId, ensureWorktreeRootGroup])

  // Filter editor files to only show those belonging to the active worktree
  const worktreeFiles = activeWorktreeId
    ? openFiles.filter((f) => f.worktreeId === activeWorktreeId)
    : []
  const worktreeBrowserTabs = activeWorktreeId
    ? (browserTabsByWorktree[activeWorktreeId] ?? [])
    : []
  const getEffectiveLayoutForWorktree = (worktreeId: string) =>
    getEffectiveLayout(worktreeId, layoutByWorktree, groupsByWorktree, activeGroupIdByWorktree)
  const effectiveActiveLayout = activeWorktreeId
    ? getEffectiveLayoutForWorktree(activeWorktreeId)
    : undefined
  const activeWorktreeBrowserTabIdsKey = worktreeBrowserTabs.map((tab) => tab.id).join(',')
  const activeContextualTourId = useAppStore((s) => s.activeContextualTourId)
  const hasSplitTerminalPane = useAppStore((s) =>
    hasFeatureInteraction(s.featureInteractions, 'terminal-pane-split')
  )

  useContextualTour(
    'workspace-agent-sessions',
    Boolean(
      activeWorktreeId &&
      activeView === 'terminal' &&
      workspaceSessionReady &&
      activeTabType === 'terminal' &&
      Boolean(activeTabId) &&
      (!hasSplitTerminalPane || activeContextualTourId === 'workspace-agent-sessions')
    ),
    'workspace_agent_sessions_visible'
  )

  const {
    saveDialogFileId,
    saveDialogFile,
    handleCloseFile,
    queueEditorCloseRequests,
    handleSaveDialogSave,
    handleSaveDialogDiscard,
    handleSaveDialogCancel
  } = useEditorCloseQueue({ onQueueDrained: () => {}, onQueueCancelled: () => {} })

  const {
    activationDeferredMountTabIdsByWorktree,
    mountedWorktreeIdsRef,
    mountedWorktreeIds,
    measurableBackgroundWorktreeIdsRef,
    measurableBackgroundWorktreeIds,
    backgroundMountTabIdsByWorktree,
    activationDeferredMountTabIdsByWorktreeRef,
    backgroundMountRevision,
    anyMountedWorktreeHasLayout
  } = useTerminalWorktreeMounting({
    workspaceSurfaces
  })

  const { parkedTerminalWorktreeIds, forceParkedTerminalWorktreeIds } = useTerminalColdParking({
    workspaceSurfaces,
    mountedWorktreeIdsRef,
    measurableBackgroundWorktreeIdsRef,
    activationDeferredMountTabIdsByWorktreeRef,
    backgroundMountRevision,
    anyMountedWorktreeHasLayout,
    getEffectiveLayoutForWorktree
  })

  const {
    handleNewTab,
    handleNewAgentTab,
    handleNewSimulatorTab,
    handleNewBrowserTab,
    handleNewFile
  } = useTabCreateActions()

  const { handleCloseTab, handleCloseBrowserTab, handlePtyExit, handleCloseAllFiles } =
    useTabCloseActions(queueEditorCloseRequests)

  useTerminalWorkspaceKeyboardShortcuts({
    handleNewTab,
    handleNewAgentTab,
    handleNewSimulatorTab,
    handleNewBrowserTab,
    handleNewFile,
    handleCloseFile,
    handleCloseBrowserTab,
    handleCloseAllFiles
  })

  useEffect(() => {
    const rememberedTabId = activeWorktreeId
      ? (activeTabIdByWorktree[activeWorktreeId] ?? null)
      : null
    // Why: prefer the worktree's remembered active tab over the first tab so a
    // repair firing on a transient worktree-switch render restores the tab the
    // user left on instead of permanently resetting the selection to Terminal 1.
    const repairedTabId = resolveRepairedActiveTerminalTabId({
      activeTabType,
      activeTabId,
      rememberedTabId,
      tabs
    })
    if (!repairedTabId) {
      return
    }
    // Why: mutating Zustand during render trips React's "Cannot update a
    // component while rendering a different component" warning. Keep the repair
    // terminal-only so inactive CLI-created tabs cannot steal editor/browser focus.
    setActiveTab(repairedTabId)
    // Why: `tabs` is intentionally the dependency here because the repair must
    // react to tab-order/content changes, not just scalar IDs. The list comes
    // from Zustand selectors and is small in practice, so this explicit repair
    // effect is preferred over duplicating reconciliation state.
  }, [activeTabId, activeTabType, setActiveTab, tabs, activeTabIdByWorktree, activeWorktreeId])

  useWorktreeActivationBootstrap()

  // Why: defensive guard against state inconsistency. If activeTabType is
  // 'browser' but no browser tab can be rendered (e.g. activeBrowserTabId is
  // null or doesn't match any tab), fall back to terminal view instead of
  // rendering a blank screen. This runs as an effect (not during render)
  // because calling Zustand mutations during render interferes with React's
  // render cycle and causes blank screens when creating new tabs.
  useEffect(() => {
    const activeWorktreeBrowserTabs = activeWorktreeId
      ? (useAppStore.getState().browserTabsByWorktree[activeWorktreeId] ?? [])
      : []
    if (
      activeTabType === 'browser' &&
      activeWorktreeId &&
      (!activeBrowserTabId ||
        !activeWorktreeBrowserTabs.some((tab) => tab.id === activeBrowserTabId))
    ) {
      const fallbackBrowserTab = activeWorktreeBrowserTabs[0]
      if (fallbackBrowserTab) {
        setActiveBrowserTab(fallbackBrowserTab.id)
      } else {
        setActiveTabType('terminal')
      }
    }
  }, [
    activeTabType,
    activeWorktreeId,
    activeBrowserTabId,
    activeWorktreeBrowserTabIdsKey,
    setActiveBrowserTab,
    setActiveTabType
  ])

  return (
    <div
      className={cn(
        'flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden',
        TAB_CONTENT_SURFACE_CLASSES,
        activeWorktreeId ? '' : 'hidden'
      )}
      data-rendered-active-worktree-id={activeWorktreeId ?? undefined}
    >
      <EditorAutosaveController />

      {anyMountedWorktreeHasLayout ? (
        <div
          className={cn(
            'relative flex flex-1 min-w-0 min-h-0 overflow-hidden',
            effectiveActiveLayout ? '' : 'hidden'
          )}
        >
          {/* Why: each mounted worktree surface is absolutely positioned so we
              can preserve hidden trees without reflowing the active one. Keep
              a relative anchor here so those panes size to the workspace body
              rather than some outer ancestor when split groups are enabled. */}
          {workspaceSurfaces
            .filter((workspace) => mountedWorktreeIds.has(workspace.id))
            .map((workspace) => {
              const layout = getEffectiveLayoutForWorktree(workspace.id)
              if (!layout) {
                return null
              }
              // Why: strict equality keeps preserved workspace surfaces hidden
              // behind every non-terminal top-level view.
              const isVisible = activeView === 'terminal' && workspace.id === activeWorktreeId
              const shouldMeasureHiddenWorktree =
                !isVisible && measurableBackgroundWorktreeIds.has(workspace.id)
              const shouldColdParkTerminalPanes =
                !isVisible &&
                !shouldMeasureHiddenWorktree &&
                parkedTerminalWorktreeIds.has(workspace.id)
              return (
                <WorktreeSplitSurface
                  key={`tab-groups-${workspace.id}`}
                  worktreeId={workspace.id}
                  worktreePath={workspace.path}
                  layout={layout}
                  focusedGroupId={activeGroupIdByWorktree[workspace.id]}
                  isVisible={isVisible}
                  shouldMeasureHiddenWorktree={shouldMeasureHiddenWorktree}
                  shouldColdParkTerminalPanes={shouldColdParkTerminalPanes}
                  forceParkTerminalPanes={forceParkedTerminalWorktreeIds.has(workspace.id)}
                  backgroundMountTabIds={backgroundMountTabIdsByWorktree.get(workspace.id) ?? null}
                  activationDeferredMountTabIds={
                    activationDeferredMountTabIdsByWorktree.get(workspace.id) ?? null
                  }
                />
              )
            })}
        </div>
      ) : null}

      {!effectiveActiveLayout && !anyMountedWorktreeHasLayout && (
        <LegacyWorkspaceSurfaces
          workspaceSurfaces={workspaceSurfaces}
          mountedWorktreeIds={mountedWorktreeIds}
          measurableBackgroundWorktreeIds={measurableBackgroundWorktreeIds}
          parkedTerminalWorktreeIds={parkedTerminalWorktreeIds}
          forceParkedTerminalWorktreeIds={forceParkedTerminalWorktreeIds}
          backgroundMountTabIdsByWorktree={backgroundMountTabIdsByWorktree}
          activeView={activeView}
          activeWorktreeId={activeWorktreeId}
          activeTabId={activeTabId}
          activeTabType={activeTabType}
          tabsByWorktree={tabsByWorktree}
          worktreeFiles={worktreeFiles}
          onPtyExit={handlePtyExit}
          onCloseTab={handleCloseTab}
        />
      )}

      <SaveConfirmationDialog
        file={saveDialogFile}
        open={saveDialogFileId !== null}
        onCancel={handleSaveDialogCancel}
        onDiscard={handleSaveDialogDiscard}
        onSave={handleSaveDialogSave}
      />
    </div>
  )
}

// Why: the default export is required by application-shell.tsx's
// `React.lazy(() => import(...))` boundary.
export default TerminalWorkspacePanel
