import { translate } from '~renderer/i18n/i18n'
import { GitDiff } from '~renderer/icons/hugeicons'

import type { SourceControlController } from './controller'
import { SourceControlHeaderIconButton } from './header-icon-button'
import { SourceControlScopeSelect } from './scope-select'

export function SourceControlScopeToolbarSelect({
  controller
}: {
  controller: SourceControlController
}): React.JSX.Element | null {
  const { activeScope, scopeOptions, selectScope } = controller
  return (
    <SourceControlScopeSelect
      activeScope={activeScope}
      options={scopeOptions}
      onSelectScope={selectScope}
    />
  )
}

// Why: staging and discarding stay on the group headers inside the tree, so the
// toolbar only carries the action that spans the whole scope.
export function SourceControlScopeToolbarActions({
  controller
}: {
  controller: SourceControlController
}): React.JSX.Element | null {
  const {
    activeScope,
    activeWorktreeId,
    branchSummary,
    openAllDiffs,
    openBranchAllDiffs,
    workspacePanelTabId,
    worktreePath
  } = controller
  if (!activeScope || !activeWorktreeId || !worktreePath) {
    return null
  }
  if (activeScope.id === 'branch' && branchSummary?.status !== 'ready') {
    return null
  }
  return (
    <SourceControlHeaderIconButton
      icon={GitDiff}
      label={translate('auto.components.workspacePanel.SourceControl.48db37cca9', 'View all')}
      onClick={() => {
        if (activeScope.id === 'branch') {
          if (branchSummary?.status !== 'ready') {
            return
          }
          openBranchAllDiffs(activeWorktreeId, worktreePath, branchSummary, undefined, {
            workspacePanelTabId
          })
          return
        }
        openAllDiffs(activeWorktreeId, worktreePath, undefined, undefined, undefined, {
          workspacePanelTabId
        })
      }}
    />
  )
}
