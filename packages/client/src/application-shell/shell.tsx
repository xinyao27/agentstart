import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { SYNC_FIT_PANES_EVENT } from '~renderer/constants/terminal'
import { LoadingIndicatorStyleProvider } from '~renderer/loading/indicator'
import { useRateLimitResumeDetector } from '~renderer/rate-limit-resume/detector'
import { useRateLimitResumeDispatch } from '~renderer/rate-limit-resume/use-rate-limit-resume-dispatch'
import { useRateLimitResumeNotifications } from '~renderer/rate-limit-resume/use-rate-limit-resume-notifications'
import { Toaster } from '~renderer/ui/sonner'
import { TooltipProvider } from '~renderer/ui/tooltip'

import RetainedAgentsSyncGate from '../dashboard/retained-agents-sync-gate'
import { useEditorExternalWatch } from '../editor/use-editor-external-watch'
import {
  getSidePanelPresenceSnapshot,
  subscribeSidePanelPresence
} from '../extension/side-panel/presence'
import { useGitHubVisibilityRefresh } from '../github/use-visibility-refresh'
import { shouldShowOnboarding } from '../onboarding/should-show-onboarding'
import { WorkspacePortScanner } from '../ports/workspace-port-scanner'
import { useProjectCatalog } from '../project-catalog/provider'
import { useRemoteSessionTabsSync } from '../runtime/remote-session/session'
import { SkillFreshnessNudge } from '../skills/skill-freshness-nudge'
import { useAppStore } from '../store/state'
import PinnedTabCloseDialog from '../terminal-pane/pinned-tab-close-dialog'
import { useSystemPrefersDark } from '../terminal-pane/use-system-prefers-dark'
import {
  hasRequestedBackgroundTerminalWorktreeMount,
  subscribeBackgroundTerminalWorktreeMountRequests
} from '../terminal/background-terminal-worktree-mount'
import { selectActiveTerminalChromeState } from '../terminal/state/chrome-selector'
import { useThemeGradientStyleVariables } from '../theme-gradient/style-variables'
import { ConfirmationDialogProvider } from '../ui/confirmation-dialog'
import { useGitStatusPolling } from '../workspace-panel/use-git-status-polling'
import { AgentHibernationGate } from './agent-hibernation-gate'
import { installRendererCommandToasts } from './command-result-toasts'
import { resolveMountedLazyModalIds, type LazyModalId } from './lazy-modal-mount-state'
import { ShellLateModals, ShellPrimaryModals } from './shell-modals'
import { ShellMiddleOverlays, ShellTrailingOverlays } from './shell-status-overlays'
import { activeViewFor, isWorkspaceBodyVisible } from './state/visible-surface'
import { useAutoAckViewedAgent } from './use-auto-ack-viewed-agent'
import { useDocumentAppearance } from './use-document-appearance'
import { useFeatureTips } from './use-feature-tips'
import { useGlobalShortcuts } from './use-global-shortcuts'
import { useIpcEvents } from './use-ipc-events'
import { useLargeTextControlPaste } from './use-large-text-control-paste'
import { usePersistedUi } from './use-persisted-ui'
import { usePrimarySelectionPaste } from './use-primary-selection-paste'
import { useRadixBodyPointerEventsRecovery } from './use-radix-body-pointer-events-recovery'
import { useRuntimeGraphSync } from './use-runtime-graph-sync'
import { useSessionPersistence } from './use-session-persistence'
import { useStartupHydration } from './use-startup-hydration'
import { WorkspaceShellLayout } from './workspace-shell-layout'
import { shouldShowWorktreeCreationSurface } from './worktree-creation-surface'

// Why: presentation must exist before any bootstrap action can publish a result,
// and it must not disappear during React remounts.
installRendererCommandToasts()

function App(): React.JSX.Element {
  const projectCatalog = useProjectCatalog()
  useRadixBodyPointerEventsRecovery()
  useRemoteSessionTabsSync()
  // Why: derived from the hosting scope's active tab, so the surface this shell
  // renders is the one the tab strip shows as selected. Every child below takes it as a prop and keeps its
  // existing `=== 'terminal'` / `=== '<page>'` comparisons.
  const activeView = useAppStore((s) => activeViewFor(s))
  const activeModal = useAppStore((s) => s.activeModal)
  const { activeWorktreeId } = useAppStore(useShallow(selectActiveTerminalChromeState))
  const activeGroupIdByWorktree = useAppStore((s) => s.activeGroupIdByWorktree)
  const groupsByWorktree = useAppStore((s) => s.groupsByWorktree)
  const unifiedTabsByWorktree = useAppStore((s) => s.unifiedTabsByWorktree)
  const activePendingCreationId = useAppStore((s) => s.activePendingCreationId)
  // Why: the creation surface owns the tab strip from the first pending frame.
  // Gating it on the delayed loader flag made the tab bar swap in mid-create.
  const activePendingCreationExists = useAppStore(
    (s) =>
      s.activePendingCreationId !== null &&
      s.pendingWorktreeCreations[s.activePendingCreationId] !== undefined
  )
  // Why: App swaps the sidebar between workspace and landing layouts when the
  // active workspace is slept/deleted. Keep virtualized scroll memory above
  // that remount so the left workspace list doesn't restart at scrollTop 0.
  const workspaceSessionReady = useAppStore((s) => s.workspaceSessionReady)
  const backgroundTerminalMountRequested = useSyncExternalStore(
    subscribeBackgroundTerminalWorktreeMountRequests,
    hasRequestedBackgroundTerminalWorktreeMount,
    hasRequestedBackgroundTerminalWorktreeMount
  )
  const keybindings = useAppStore((s) => s.keybindings)
  const activeContextualTourId = useAppStore((s) => s.activeContextualTourId)
  const terminalWorkbenchRequested = activeWorktreeId !== null || backgroundTerminalMountRequested
  const [hasMountedTerminalWorkbench, setHasMountedTerminalWorkbench] = useState(
    terminalWorkbenchRequested
  )
  if (terminalWorkbenchRequested && !hasMountedTerminalWorkbench) {
    setHasMountedTerminalWorkbench(true)
  }
  // Why: skip the terminal bundle on the no-workspace landing path, but once a
  // workspace has mounted, keep Terminal-owned hidden panes alive through sleep
  // and shutdown transitions where activeWorktreeId can briefly become null.
  const shouldMountTerminalWorkbench = terminalWorkbenchRequested || hasMountedTerminalWorkbench
  // Why: visible worktree creation owns its faux tab strip from start to finish;
  // the previous workspace must stay mounted for retention without rendering
  // real chrome.
  const creationLayoutActive = shouldShowWorktreeCreationSurface({
    workspaceBodyVisible: isWorkspaceBodyVisible({
      activeGroupIdByWorktree,
      activeWorktreeId,
      groupsByWorktree,
      unifiedTabsByWorktree
    }),
    activePendingCreationId,
    hasActivePendingCreation: activePendingCreationExists
  })
  const workspaceChromeActive =
    activeView === 'terminal' && activeWorktreeId !== null && !creationLayoutActive
  const terminalWorkbenchVisible =
    activeView === 'terminal' && activeWorktreeId !== null && !creationLayoutActive
  const sidebarWidth = useAppStore((s) => s.sidebarWidth)
  const extensionSidePanelOpen = useSyncExternalStore(
    subscribeSidePanelPresence,
    getSidePanelPresenceSnapshot,
    getSidePanelPresenceSnapshot
  )
  const groupBy = useAppStore((s) => s.groupBy)
  const sortBy = useAppStore((s) => s.sortBy)
  const projectOrderBy = useAppStore((s) => s.projectOrderBy)
  const showSleepingWorkspaces = useAppStore((s) => s.showSleepingWorkspaces)
  const hideDefaultBranchWorkspace = useAppStore((s) => s.hideDefaultBranchWorkspace)
  const showDotfilesByWorktree = useAppStore((s) => s.showDotfilesByWorktree)
  const filterRepoIds = useAppStore((s) => s.filterRepoIds)
  const acknowledgedAgentsByPaneKey = useAppStore((s) => s.acknowledgedAgentsByPaneKey)
  const persistedUIReady = useAppStore((s) => s.persistedUIReady)
  const shouldMountContextualTourOverlay = activeContextualTourId !== null
  const shouldMountSetupGuideTelemetryObserver = persistedUIReady
  const markdownTocPanelWidth = useAppStore((s) => s.markdownTocPanelWidth)
  const workspacePanelOpen = useAppStore((s) => s.workspacePanelOpen)
  const workspacePanelTab = useAppStore((s) => s.workspacePanelTab)
  const workspacePanelExplorerView = useAppStore((s) => s.workspacePanelExplorerView)
  const settings = useAppStore((s) => s.settings)
  const systemPrefersDark = useSystemPrefersDark()
  const themeGradientVariables = useThemeGradientStyleVariables(systemPrefersDark)
  usePrimarySelectionPaste()
  useLargeTextControlPaste()
  const [mountedLazyModalIds, setMountedLazyModalIds] = useState<Set<LazyModalId>>(() => new Set())
  const isAddRepoDialogOpen = activeModal === 'add-repo'
  const [addRepoMountState, setAddRepoMountState] = useState({
    wasOpen: isAddRepoDialogOpen,
    isRetained: false
  })
  if (isAddRepoDialogOpen && !addRepoMountState.wasOpen) {
    setAddRepoMountState({ wasOpen: true, isRetained: false })
  } else if (!isAddRepoDialogOpen && addRepoMountState.wasOpen) {
    setAddRepoMountState({ wasOpen: false, isRetained: true })
  }
  const shouldMountAddRepoDialog = isAddRepoDialogOpen || addRepoMountState.isRetained
  const { onboarding, onboardingLoaded, setOnboarding } = useStartupHydration(
    projectCatalog.isPending,
    projectCatalog.repos,
    projectCatalog.runtimeEnvironments
  )
  const unmountAddRepoDialogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldRenderOnboarding = onboarding !== null && shouldShowOnboarding(onboarding)

  useEffect(() => {
    if (!addRepoMountState.isRetained) {
      if (unmountAddRepoDialogTimerRef.current) {
        clearTimeout(unmountAddRepoDialogTimerRef.current)
        unmountAddRepoDialogTimerRef.current = null
      }
      return
    }
    if (!unmountAddRepoDialogTimerRef.current) {
      // Why: AddRepoDialog's close effect aborts in-flight clone/nested work.
      // Keep one closed render, then remove hidden SSH/remote subscriptions.
      unmountAddRepoDialogTimerRef.current = setTimeout(() => {
        setAddRepoMountState((current) => ({ ...current, isRetained: false }))
        unmountAddRepoDialogTimerRef.current = null
      }, 0)
    }
    return () => {
      if (unmountAddRepoDialogTimerRef.current) {
        clearTimeout(unmountAddRepoDialogTimerRef.current)
        unmountAddRepoDialogTimerRef.current = null
      }
    }
  }, [addRepoMountState.isRetained])

  // Subscribe to IPC push events
  useIpcEvents()
  // Why: both watch every agent pane, so they must run above any pane subtree
  // that unmounts when the user switches tabs. Neither subscribes reactively —
  // the detector uses a plain store listener — so App does not re-render on
  // pane churn.
  useRateLimitResumeDetector()
  useRateLimitResumeDispatch()
  useRateLimitResumeNotifications()
  // Why: retention must run at App level so the inline per-card agents list
  // always sees retained entries. If retention ran inside the sidebar-card
  // subtree, "done" agents would vanish any time the user collapsed a card's
  // inline agents section. The retention hooks are hosted inside
  // <RetainedAgentsSyncGate /> (a leaf component that renders null) rather
  // than being called inline here so its high-churn store subscriptions
  // (agentStatusByPaneKey ticks at PTY event frequency)
  // do not re-render the App tree on every agent status update.
  // Why: git conflict-operation state also drives the worktree cards. Polling
  // cannot live under an individual workspace-panel tab because those tabs
  // mount on demand, which would leave worktree badges stale until opened.
  // Why: visible-window polling runs immediately on mount. Wait until the
  // workspace session has hydrated so git status work cannot compete with the
  // first window becoming usable.
  useGitStatusPolling({ enabled: workspaceSessionReady })
  // Why: the editor must hear external filesystem changes regardless of
  // which workspace-panel tab is visible (Explorer unmounts when the user
  // switches between Changes and Review). Wiring this at App level mirrors
  // VSCode's workbench-scoped `TextFileEditorModelManager`, which reloads
  // clean models from a single always-on file-change subscription instead
  // of tying reloads to the Explorer UI lifecycle.
  useEditorExternalWatch()
  useAutoAckViewedAgent()
  useRuntimeGraphSync(workspaceSessionReady)
  useSessionPersistence()
  usePersistedUi({
    acknowledgedAgentsByPaneKey,
    filterRepoIds,
    groupBy,
    hideDefaultBranchWorkspace,
    markdownTocPanelWidth,
    persistedUIReady,
    projectOrderBy,
    workspacePanelExplorerView,
    workspacePanelOpen,
    workspacePanelTab,
    showDotfilesByWorktree,
    showSleepingWorkspaces,
    sidebarWidth,
    sortBy
  })
  useDocumentAppearance(settings)
  useGitHubVisibilityRefresh()
  useFeatureTips({
    activeModal,
    onboarding,
    onboardingLoaded,
    persistedUIReady,
    settings
  })

  // Why: sidebar open/close flips width instantaneously. useLayoutEffect
  // runs synchronously after React commits the DOM but before paint, so
  // dispatching SYNC_FIT_PANES_EVENT here lets the terminal reflow in the
  // same frame as the width change — no "wrongly-sized terminal" transient
  // and no delayed snap. The later ResizeObserver rAF and 150ms debounced
  // fit both become no-ops because proposeDimensions() will match the
  // already-fitted cols/rows.
  useLayoutEffect(() => {
    window.dispatchEvent(new CustomEvent(SYNC_FIT_PANES_EVENT))
  }, [extensionSidePanelOpen])

  const showNavigationSidebar = !extensionSidePanelOpen

  const globalShortcutState = useAppStore(
    useShallow((s) => ({
      activeGroupIdByWorktree: s.activeGroupIdByWorktree,
      activeWorktreeId,
      creationLayoutActive,
      groupsByWorktree: s.groupsByWorktree,
      keybindings,
      terminalShortcutPolicy: settings?.terminalShortcutPolicy,
      unifiedTabsByWorktree: s.unifiedTabsByWorktree,
      workspaceChromeActive
    }))
  )
  useGlobalShortcuts(globalShortcutState)
  const resolvedMountedLazyModalIds = resolveMountedLazyModalIds(activeModal, mountedLazyModalIds)
  if (resolvedMountedLazyModalIds !== mountedLazyModalIds) {
    // Why: lazy-load these modals only after first use, then keep them mounted
    // so repeat opens preserve their local state and avoid re-fetch flashes.
    setMountedLazyModalIds(new Set(resolvedMountedLazyModalIds))
  }

  return (
    <LoadingIndicatorStyleProvider
      loaderStyle={settings?.loaderStyle}
      className="app-chrome-plane flex h-dvh w-screen flex-col overflow-hidden"
      data-theme-gradient={themeGradientVariables ? 'on' : undefined}
      style={
        {
          ...themeGradientVariables,
          '--settings-sidebar-width': '280px'
        } as React.CSSProperties
      }
    >
      <TooltipProvider>
        <ConfirmationDialogProvider>
          <>
            <WorkspacePortScanner enabled={workspaceSessionReady} />
            {/* Why: leaf-mounted retention sync keeps agent-status retention
            subscriptions from re-rendering the App tree. */}
            <RetainedAgentsSyncGate />
            <AgentHibernationGate />
            {/* Why: workspace activation is a hot path; including activeWorktreeId
            in reset keys remounts whole surfaces during wake. */}
            <WorkspaceShellLayout
              activePendingCreationId={activePendingCreationId}
              activeView={activeView}
              activeWorktreeId={activeWorktreeId}
              creationLayoutActive={creationLayoutActive}
              shouldMountTerminalWorkbench={shouldMountTerminalWorkbench}
              showNavigationSidebar={showNavigationSidebar}
              terminalWorkbenchVisible={terminalWorkbenchVisible}
              workspaceChromeActive={workspaceChromeActive}
            />
            <ShellPrimaryModals
              activeModal={activeModal}
              mountedLazyModalIds={resolvedMountedLazyModalIds}
              shouldMountAddRepoDialog={shouldMountAddRepoDialog}
              shouldMountSetupGuideTelemetryObserver={shouldMountSetupGuideTelemetryObserver}
            />
            <ShellMiddleOverlays
              activeView={activeView}
              shouldMountContextualTourOverlay={shouldMountContextualTourOverlay}
              telemetryOptedIn={settings?.telemetry?.optedIn ?? undefined}
            />
            <ShellLateModals
              activeModal={activeModal}
              onboarding={onboarding}
              setOnboarding={setOnboarding}
              shouldRenderOnboarding={shouldRenderOnboarding}
            />
            <ShellTrailingOverlays activeView={activeView} />
          </>
        </ConfirmationDialogProvider>
      </TooltipProvider>
      <Toaster
        theme={settings?.theme ?? 'system'}
        closeButton
        toastOptions={{ className: 'font-sans text-sm' }}
      />
      <SkillFreshnessNudge />
      <PinnedTabCloseDialog />
    </LoadingIndicatorStyleProvider>
  )
}

export default App
