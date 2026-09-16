import { translate } from '~renderer/i18n/i18n'
import { FolderPlus, Plus } from '~renderer/icons/hugeicons'
import { useShortcutLabel } from '~renderer/keyboard-input/use-shortcut-label'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '~renderer/ui/tooltip'

import { openWorkspaceCreationComposerWithTourHandoff } from '../contextual-tours/workspace-creation-tour-handoff'
import { openSidebarShellModal } from './host-navigation'
import SidebarWorkspaceOptionsMenu from './workspace-options-menu'

const SidebarHeader = function SidebarHeader({
  canCreateWorkspace,
  projectId,
  showAddProject = true
}: {
  canCreateWorkspace: boolean
  projectId?: string
  showAddProject?: boolean
}) {
  const openModal = useAppStore((s) => s.openModal)
  const newWorktreeShortcutLabel = useShortcutLabel('workspace.create')
  const groupBy = useAppStore((s) => s.groupBy)
  const sidebarTitle = projectId
    ? translate('auto.components.sidebar.SidebarHeader.f8fa32b294', 'Worktrees')
    : groupBy === 'repo'
      ? translate('auto.components.sidebar.SidebarHeader.3b53bca96a', 'Projects')
      : translate('auto.components.sidebar.SidebarHeader.08d251dad5', 'Workspaces')

  return (
    <div className="mt-2 flex h-8 items-center justify-between gap-2 px-2">
      <div className="flex min-w-0 items-center gap-1">
        <span
          className="text-muted-foreground/80 pr-0.5 pl-2 text-xs font-semibold select-none"
          data-sidebar-section-title={groupBy === 'repo' ? 'projects' : 'workspaces'}
        >
          {sidebarTitle}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {!projectId ? <SidebarWorkspaceOptionsMenu /> : null}

        {showAddProject ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={translate(
                    'auto.components.sidebar.SidebarHeader.25a95899c9',
                    'Add Project'
                  )}
                  onClick={() => {
                    if (openSidebarShellModal('add-repo')) {
                      return
                    }
                    openModal('add-repo')
                  }}
                >
                  <FolderPlus className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent side="bottom" sideOffset={6}>
              {translate('auto.components.sidebar.SidebarHeader.25a95899c9', 'Add Project')}
            </TooltipContent>
          </Tooltip>
        ) : null}

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  if (!canCreateWorkspace) {
                    return
                  }
                  if (openSidebarShellModal('new-workspace-composer')) {
                    return
                  }
                  // Why: the parallel-work tour must click the real sidebar
                  // control so it can hand off to the workspace-creation tour.
                  openWorkspaceCreationComposerWithTourHandoff(projectId)
                }}
                aria-label={translate(
                  'auto.components.sidebar.SidebarHeader.92154beb7e',
                  'New workspace'
                )}
                disabled={!canCreateWorkspace}
                data-contextual-tour-target="workspace-create-control"
              >
                <Plus className="size-3.5" />
              </Button>
            }
          />
          <TooltipContent side="right" sideOffset={6}>
            {canCreateWorkspace
              ? translate(
                  'auto.components.sidebar.SidebarHeader.ca6f729da2',
                  'New workspace ({{value0}})',
                  { value0: newWorktreeShortcutLabel }
                )
              : translate(
                  'auto.components.sidebar.SidebarHeader.5c9c7c16aa',
                  'Add a project to create workspaces'
                )}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

export default SidebarHeader
