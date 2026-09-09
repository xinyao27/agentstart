import type { ProjectGroup } from '@yiru/protocol/project/group-model'
import type { FolderWorkspacePathStatus } from '@yiru/protocol/workspace/folder-path'
import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { DotsThree as Ellipsis, Plus } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '~renderer/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { getFolderWorkspacePathStatusDescription } from '../folder-workspace-path-status'
import { REPO_HEADER_ACTION_BUTTON_CLASS } from '../repo-header-action-button-class'
import {
  handleRepoHeaderActionPointerDown,
  stopRepoHeaderKeyboardToggle,
  stopRepoHeaderMenuEvent
} from './reveal'

export function ProjectGroupHeaderActions(props: {
  projectGroup: ProjectGroup
  label: string
  pathStatus: FolderWorkspacePathStatus | null | undefined
  isCreateDisabled: boolean
  onRename: (groupId: string, label: string) => void
  onDelete: (groupId: string, label: string) => void
  onCreateWorkspace: (projectGroup: ProjectGroup) => void
}): React.JSX.Element {
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className={REPO_HEADER_ACTION_BUTTON_CLASS}
              data-repo-header-action=""
              aria-label={translate(
                'auto.components.sidebar.WorktreeList.79465e9034',
                'Group actions for {{value0}}',
                { value0: props.label }
              )}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={stopRepoHeaderKeyboardToggle}
              onPointerDown={handleRepoHeaderActionPointerDown}
            >
              <Ellipsis className="size-3.5" />
            </Button>
          }
        />
        <DropdownMenuContent
          align="end"
          side="bottom"
          sideOffset={6}
          // Why: portal events still bubble through the project header.
          onPointerDown={stopRepoHeaderMenuEvent}
          onMouseDown={stopRepoHeaderMenuEvent}
          onPointerUp={stopRepoHeaderMenuEvent}
          onMouseUp={stopRepoHeaderMenuEvent}
          onClick={stopRepoHeaderMenuEvent}
          onKeyDown={stopRepoHeaderMenuEvent}
        >
          <DropdownMenuItem onClick={() => props.onRename(props.projectGroup.id, props.label)}>
            {translate('auto.components.sidebar.WorktreeList.4d7b73658c', 'Rename group')}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => props.onDelete(props.projectGroup.id, props.label)}
          >
            {translate('auto.components.sidebar.WorktreeList.902115cdbe', 'Delete group')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {props.projectGroup.parentPath ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                data-repo-header-action=""
                className={cn(
                  REPO_HEADER_ACTION_BUTTON_CLASS,
                  props.isCreateDisabled &&
                    'cursor-not-allowed text-muted-foreground/60 hover:bg-transparent hover:text-muted-foreground/60'
                )}
                aria-label={translate(
                  'auto.components.sidebar.WorktreeList.bd37a57ac8',
                  'Create workspace for {{value0}}',
                  { value0: props.label }
                )}
                aria-disabled={props.isCreateDisabled}
                onKeyDown={stopRepoHeaderKeyboardToggle}
                onPointerDown={handleRepoHeaderActionPointerDown}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (!props.isCreateDisabled) {
                    props.onCreateWorkspace(props.projectGroup)
                  }
                }}
              >
                <Plus className="size-3" />
              </Button>
            }
          />
          <TooltipContent side="bottom" sideOffset={6}>
            {props.pathStatus?.exists === false
              ? getFolderWorkspacePathStatusDescription(props.pathStatus)
              : translate(
                  'auto.components.sidebar.WorktreeList.bd37a57ac8',
                  'Create workspace for {{value0}}',
                  { value0: props.label }
                )}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </>
  )
}
