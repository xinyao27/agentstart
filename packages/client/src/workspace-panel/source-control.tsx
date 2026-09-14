import React from 'react'

import { useSourceControlController } from './source-control/controller'
import { SourceControlPanel } from './source-control/panel'
import { LOCAL_WORKSPACE_PANEL_SOURCE, type WorkspacePanelSource } from './workspace-panel-source'

export { buildResolvePullRequestConflictsPrompt } from '~renderer/workspace-panel/source-control/ai/ai-prompts'
export { pickDefaultSourceControlAgent } from './source-control/panel-state'
function LocalSourceControl({ isVisible }: { isVisible: boolean }): React.JSX.Element {
  const controller = useSourceControlController({ isVisible })
  return <SourceControlPanel controller={controller} />
}

function SourceControl({
  source = LOCAL_WORKSPACE_PANEL_SOURCE,
  isVisible = true
}: {
  source?: WorkspacePanelSource
  isVisible?: boolean
}): React.JSX.Element | null {
  void source
  return <LocalSourceControl isVisible={isVisible} />
}

export default SourceControl
