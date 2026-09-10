import { Suspense } from 'react'

import { RecoverableRenderErrorBoundary } from '../error-boundaries/recoverable-render-error-boundary'
import { SidePanelNavigation } from '../extension/side-panel/navigation'
import { translate } from '../i18n/i18n'
import type { AppState } from '../store/types'
import { lazyWithRetry as lazy } from './lazy-with-retry'

const HomePage = lazy(() => import('../home/page'))
const Landing = lazy(() => import('./landing-page'))
const MobilePage = lazy(() => import('../mobile/page'))
const Settings = lazy(() => import('../settings/page'))
const SkillsPage = lazy(() => import('../skills/page'))
const Terminal = lazy(() => import('../terminal-workspace/panel'))
const WorkspaceSidebar = lazy(() => import('../workspace-panel/sidebar'))
const WorkspaceSpacePage = lazy(() => import('../workspace-space/page'))
const WorktreeCreationPanel = lazy(() => import('../worktree-creation/panel'))

type WorkspaceShellLayoutProps = {
  activePendingCreationId: string | null
  activeView: AppState['activeView']
  activeWorktreeId: string | null
  creationLayoutActive: boolean
  shouldMountTerminalWorkbench: boolean
  showSidebar: boolean
  terminalWorkbenchVisible: boolean
  workspaceChromeActive: boolean
}

export function WorkspaceShellLayout({
  activePendingCreationId,
  activeView,
  activeWorktreeId,
  creationLayoutActive,
  shouldMountTerminalWorkbench,
  showSidebar,
  terminalWorkbenchVisible,
  workspaceChromeActive
}: WorkspaceShellLayoutProps): React.JSX.Element {
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
        <div className="order-last flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
            {showSidebar ? <ExtensionNavigationColumn /> : null}
            <div
              className={
                workspaceChromeActive || creationLayoutActive
                  ? 'workspace-native-material-frame flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
                  : 'bg-background flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
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
                          <Terminal />
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
          </div>
        </div>
        {workspaceChromeActive && activeWorktreeId ? (
          <Suspense fallback={null}>
            <RecoverableRenderErrorBoundary
              boundaryId="workspace.sidebar"
              surface="right-sidebar"
              resetKey="workspace-sidebar"
              title={translate(
                'workspace.sidebar.errorTitle',
                'The workspace sidebar hit an error.'
              )}
              description={translate(
                'auto.App.8d1e160ed1',
                'Retry the sidebar or switch tabs to reload this surface.'
              )}
            >
              <WorkspaceSidebar />
            </RecoverableRenderErrorBoundary>
          </Suspense>
        ) : null}
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
            reserveCollapsedSidebarHeaderSpace={false}
          />
        ) : null}
        {activeView === 'terminal' && !activeWorktreeId && !creationLayoutActive ? (
          <Landing />
        ) : null}
      </RecoverableRenderErrorBoundary>
    </Suspense>
  )
}
