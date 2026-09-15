import React from 'react'

import { FileExplorerFilesMemo } from './file-explorer/files'
import { LOCAL_WORKSPACE_PANEL_SOURCE, type WorkspacePanelSource } from './workspace-panel-source'

function FileExplorer({
  source = LOCAL_WORKSPACE_PANEL_SOURCE,
  isVisible = true
}: {
  source?: WorkspacePanelSource
  isVisible?: boolean
}): React.JSX.Element {
  void source
  return <FileExplorerFilesMemo isVisible={isVisible} />
}

export default FileExplorer
