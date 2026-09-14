import React from 'react'

import { useSourceControlController } from './source-control/controller'
import { SourceControlPanel } from './source-control/panel'
import { LOCAL_WORKSPACE_PANEL_SOURCE, type WorkspacePanelSource } from './workspace-panel-source'

export { buildResolvePullRequestConflictsPrompt } from './source-control/ai-prompts'
export { pickDefaultSourceControlAgent } from './source-control/panel-state'
function LocalSourceControl({
  isVisible,
  workspacePanelTabId
}: {
  isVisible: boolean
  workspacePanelTabId?: string
}): React.JSX.Element {
  const controller = useSourceControlController({ isVisible, workspacePanelTabId })
  return <SourceControlPanel controller={controller} />
}

function SourceControl({
  source = LOCAL_WORKSPACE_PANEL_SOURCE,
  isVisible = true,
  workspacePanelTabId
}: {
  source?: WorkspacePanelSource
  isVisible?: boolean
  workspacePanelTabId?: string
}): React.JSX.Element | null {
  void source
  return <LocalSourceControl isVisible={isVisible} workspacePanelTabId={workspacePanelTabId} />
}

export default SourceControl
