import { Suspense } from 'react'
import { lazyWithRetry as lazy } from '~renderer/application-shell/lazy-with-retry'
import type { ActiveWorkspacePanelTab } from '~renderer/editor/state'
import type { SourceControlPanelView } from '~renderer/workspace-panel/source-control/tab/state'

import { LOCAL_WORKSPACE_PANEL_SOURCE, type WorkspacePanelSource } from './workspace-panel-source'

const FileExplorer = lazy(() => import('./file-explorer'))
const SourceControlWorkspacePanel = lazy(
  () => import('~renderer/workspace-panel/source-control/tab/panel')
)
const PortsPanel = lazy(() => import('./ports-panel'))
const AiVaultPanel = lazy(() => import('./ai-vault/panel'))
const FolderWorkspaceWorktreesPanel = lazy(() => import('./folder-workspace-worktrees-panel'))
const FolderWorkspacePrChecksPanel = lazy(() => import('./folder-workspace-pr-checks-panel'))

type WorkspacePanelContentProps = {
  effectiveTab: ActiveWorkspacePanelTab
  workspacePanelOpen: boolean
  isVisible?: boolean
  source?: WorkspacePanelSource
  sourceControlView?: SourceControlPanelView
  onSourceControlViewChange?: (view: SourceControlPanelView) => void
}

export function WorkspacePanelContent({
  effectiveTab,
  workspacePanelOpen,
  isVisible,
  source = LOCAL_WORKSPACE_PANEL_SOURCE,
  sourceControlView,
  onSourceControlViewChange
}: WorkspacePanelContentProps): React.JSX.Element {
  const panelVisible = isVisible ?? workspacePanelOpen
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <Suspense fallback={null}>
        {effectiveTab === 'explorer' && <FileExplorer source={source} isVisible={panelVisible} />}
        {effectiveTab === 'source-control' && (
          <SourceControlWorkspacePanel
            source={source}
            isVisible={panelVisible}
            view={sourceControlView}
            onViewChange={onSourceControlViewChange}
          />
        )}
        {effectiveTab === 'ports' && (
          <PortsPanel isVisible={panelVisible && effectiveTab === 'ports'} />
        )}
        {effectiveTab === 'vault' && <AiVaultPanel source={source} />}
        {effectiveTab === 'workspaces' && <FolderWorkspaceWorktreesPanel />}
        {effectiveTab === 'pr-checks' && (
          <FolderWorkspacePrChecksPanel isVisible={panelVisible && effectiveTab === 'pr-checks'} />
        )}
      </Suspense>
    </div>
  )
}
