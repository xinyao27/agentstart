import type { TopLevelView } from '@agentstart/protocol/settings/ui-state'
import { Suspense } from 'react'
import { cn } from '~renderer/ui/class-names'

import { RecoverableRenderErrorBoundary } from '../error-boundaries/recoverable-render-error-boundary'
import { SidePanelNavigation } from '../extension/side-panel/navigation'
import { translate } from '../i18n/i18n'
import { lazyWithRetry as lazy } from './lazy-with-retry'
import { isWorkspacePageView } from './state/workspace-page-views'
import { WorkspaceSharedHeaderProvider, WorkspaceSharedHeaderSlot } from './workspace-shared-header'

const HomePage = lazy(() => import('../home/page'))
const Landing = lazy(() => import('./landing-page'))
const MobilePage = lazy(() => import('../mobile/page'))
const Settings = lazy(() => import('../settings/page'))
const SkillsPage = lazy(() => import('../skills/page'))
const Terminal = lazy(() => import('../terminal-workspace/panel'))
const WorkspaceSpacePage = lazy(() => import('../workspace-space/page'))
const WorktreeCreationPanel = lazy(() => import('../worktree-creation/panel'))

type WorkspaceShellLayoutProps = {
  activePendingCreationId: string | null
  activeView: TopLevelView
  activeWorktreeId: string | null
  creationLayoutActive: boolean
  shouldMountTerminalWorkbench: boolean
  showNavigationSidebar: boolean
  terminalWorkbenchVisible: boolean
  workspaceChromeActive: boolean
}

export function WorkspaceShellLayout({
  activePendingCreationId,
  activeView,
  activeWorktreeId,
  creationLayoutActive,
  shouldMountTerminalWorkbench,
  showNavigationSidebar,
  terminalWorkbenchVisible,
  workspaceChromeActive
}: WorkspaceShellLayoutProps): React.JSX.Element {
  // Why: page views share the workspace titlebar; the slot must stay mounted so
  // the workspace strip keeps hosting beside the page tabs while a page is open.
  const pageViewActive = isWorkspacePageView(activeView)
  // Why: a workspace strip portals the titlebar whenever a workspace is open —
  // on the terminal view, or on a page, where the focused group keeps hosting
  // it. Keyed on the workspace id rather than on the workbench being mounted: a
  // workspace that has been closed leaves the workbench mounted with no active
  // id, and no group would portal at all.
  const workspaceStripHosts = (workspaceChromeActive || pageViewActive) && activeWorktreeId !== null
  // Why: with no group to portal, the app scope's own strip hosts the titlebar
  // so the chrome and the page tabs render from the same components at the same
  // geometry. The creation surface owns the titlebar outright, so it excludes
  // the app scope rather than racing it for the same target.
  const showAppScopeStrip = !workspaceStripHosts && !creationLayoutActive
  // Why: the header row is the plane's own top row, and the content card starts
  // on its baseline — so the card takes gutters on the sides and bottom only
  // while the row is there, and owns all four when the plane has the top to
  // itself.
  const headerVisible = workspaceChromeActive || creationLayoutActive || pageViewActive
  return (
    <RecoverableRenderErrorBoundary
      boundaryId="app.workspace-shell"
      surface="workspace-shell"
      resetKey={activeView}
      title={translate('auto.App.df1d56bf87', 'The workspace shell hit an error.')}
      description={translate(
        'auto.App.8504ddf267',
        'The app is still running. Retry the shell or use the menu to report the crash details.'
      )}
    >
      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        <WorkspaceSharedHeaderProvider>
          {/* Why: the chrome plane is the figure-ground — it shows as the
              header row itself and as the gutters around the content card, and
              nothing else. The header stays flush on the card's baseline so the
              selected tab's silhouette can cross into it. */}
          <div className="bg-sidebar flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {headerVisible ? (
              <WorkspaceSharedHeaderSlot showAppScopeStrip={showAppScopeStrip} />
            ) : null}
            <div
              className={cn(
                'workspace-content-card flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden',
                headerVisible ? 'mx-1.5 mb-1.5' : 'm-1.5'
              )}
            >
              {/* Why: island-in-island — the big island hosts the workbench
                  content and, when open, the navigation panel beside it; with
                  the panel closed the inner island sheds its own treatment and
                  fills the big island, so one surface reads again. */}
              <div
                className={
                  showNavigationSidebar
                    ? 'workspace-inner-island m-1.5 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
                    : 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
                }
              >
                <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {shouldMountTerminalWorkbench ? (
                      <div
                        className={
                          terminalWorkbenchVisible
                            ? 'flex min-h-0 min-w-0 flex-1'
                            : 'hidden min-h-0 min-w-0 flex-1'
                        }
                      >
                        <Suspense fallback={null}>
                          <RecoverableRenderErrorBoundary
                            boundaryId="terminal.workbench"
                            surface="terminal-workbench"
                            resetKey="terminal"
                            title={translate(
                              'auto.App.5a9519aef0',
                              'The workspace workbench hit an error.'
                            )}
                            description={translate(
                              'auto.App.98d4ea2823',
                              'Terminal, browser, or editor rendering failed in this workspace. Retry to remount it.'
                            )}
                          >
                            <Terminal useSharedHeader={workspaceChromeActive || pageViewActive} />
                          </RecoverableRenderErrorBoundary>
                        </Suspense>
                      </div>
                    ) : null}
                    <WorkspacePage
                      activePendingCreationId={activePendingCreationId}
                      activeView={activeView}
                      activeWorktreeId={activeWorktreeId}
                      creationLayoutActive={creationLayoutActive}
                    />
                  </div>
                </div>
              </div>
              {showNavigationSidebar ? <ExtensionNavigationColumn /> : null}
            </div>
          </div>
        </WorkspaceSharedHeaderProvider>
      </div>
    </RecoverableRenderErrorBoundary>
  )
}

function ExtensionNavigationColumn(): React.JSX.Element {
  return (
    <div className="order-last flex min-h-0 shrink-0">
      <SidePanelNavigation presentation="workbench" />
    </div>
  )
}

type WorkspacePageProps = Pick<
  WorkspaceShellLayoutProps,
  'activePendingCreationId' | 'activeView' | 'activeWorktreeId' | 'creationLayoutActive'
>

function WorkspacePage({
  activePendingCreationId,
  activeView,
  activeWorktreeId,
  creationLayoutActive
}: WorkspacePageProps): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <RecoverableRenderErrorBoundary
        boundaryId={`page.${activeView}`}
        surface="page"
        resetKey={activeView}
        title={translate('auto.App.b7a714db1e', 'This page hit an error.')}
        description={translate(
          'auto.App.03a14f6b5b',
          'Retry the page or navigate to another AgentStart surface.'
        )}
      >
        {activeView === 'settings' ? <Settings /> : null}
        {activeView === 'home' ? <HomePage /> : null}
        {activeView === 'skills' ? <SkillsPage /> : null}
        {activeView === 'space' ? <WorkspaceSpacePage /> : null}
        {activeView === 'mobile' ? <MobilePage /> : null}
        {activeView === 'terminal' && creationLayoutActive && activePendingCreationId ? (
          <WorktreeCreationPanel
            creationId={activePendingCreationId}
            useSharedHeader={creationLayoutActive}
          />
        ) : null}
        {activeView === 'terminal' && !activeWorktreeId && !creationLayoutActive ? (
          <Landing />
        ) : null}
      </RecoverableRenderErrorBoundary>
    </Suspense>
  )
}
