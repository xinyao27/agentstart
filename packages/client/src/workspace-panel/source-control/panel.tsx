import { translate } from '~renderer/i18n/i18n'

import type { SourceControlController } from './controller'
import { SourceControlPanelBody } from './panel-body'
import { SourceControlPanelDialogs } from './panel-dialogs'
import { SourceControlPanelHeader } from './panel-header'

export function SourceControlPanel({
  controller
}: {
  controller: SourceControlController
}): React.JSX.Element {
  const { activeRepo, activeWorktree, isFolder, setSourceControlRoot, worktreePath } = controller

  if (!activeWorktree || !activeRepo || !worktreePath) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center px-4 text-center text-xs">
        {translate(
          'auto.components.workspacePanel.SourceControl.c07b236287',
          'Select a workspace to view changes'
        )}
      </div>
    )
  }
  if (isFolder) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center px-4 text-center text-xs">
        {translate(
          'auto.components.workspacePanel.SourceControl.e131cd7128',
          'Source Control is only available for Git repositories'
        )}
      </div>
    )
  }

  return (
    <>
      <div ref={setSourceControlRoot} className="relative flex h-full flex-col overflow-hidden">
        <SourceControlPanelHeader controller={controller} />
        <SourceControlPanelBody controller={controller} />
      </div>
      <SourceControlPanelDialogs controller={controller} />
    </>
  )
}
