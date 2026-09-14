import React from 'react'

import { FileExplorerFilesMemo } from './file-explorer/files'
import { LOCAL_WORKSPACE_PANEL_SOURCE, type WorkspacePanelSource } from './workspace-panel-source'

function FileExplorer({
  source = LOCAL_WORKSPACE_PANEL_SOURCE,
  isVisible = true,
  workspacePanelTabId
}: {
  source?: WorkspacePanelSource
  isVisible?: boolean
  workspacePanelTabId?: string
}): React.JSX.Element {
  void source
  return <FileExplorerFilesMemo isVisible={isVisible} workspacePanelTabId={workspacePanelTabId} />
}

export default FileExplorer
