import type { ProjectGroup } from '@agentstart/protocol/project/group-model'
import type { Repo } from '@agentstart/protocol/project/repository'
import { isGitRepoKind } from '@agentstart/protocol/project/repository'
import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  XCircle as CircleX,
  DotsThree as Ellipsis,
  Eye,
  FolderOpen as FolderInput,
  Shapes,
  SlidersHorizontal,
  Trash as Trash2,
  FolderPlus,
  Plus
} from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '~renderer/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { getRepositoryIconSectionId } from '../../settings/repository/settings-targets'
import {
  REPO_HEADER_ACTION_BUTTON_CLASS,
  REPO_HEADER_ACTION_REVEAL_CLASS
} from '../repo-header-action-button-class'
import { getRepoHeaderCreateState } from '../repo-header-create-state'
import {
  getWorktreeVisibilityMenuLabel,
  handleRepoHeaderActionPointerDown,
  stopRepoHeaderKeyboardToggle,
  stopRepoHeaderMenuEvent
} from './reveal'

export function RepoHeaderActions(props: {
  repo: Repo
  label: string
  projectGroups: readonly ProjectGroup[]
  onOpenSettings: (repoId: string, sectionId?: string) => void
  onOpenVisibility: (repoId: string) => void
  onCreateGroup: (repo: Repo) => void
  onMoveToGroup: (repo: Repo, groupId: string) => void
  onRemoveFromGroup: (repo: Repo) => void
  onRemove: (repo: Repo) => void
  onCreate: (repoId: string) => void
}): React.JSX.Element {
  const createState = getRepoHeaderCreateState({ repo: props.repo, label: props.label })
  return (
    <>
      <DropdownMenu modal={false}>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className={REPO_HEADER_ACTION_BUTTON_CLASS}
                    data-repo-header-action=""
                    aria-label={translate(
                      'auto.components.sidebar.WorktreeList.609633a9e6',
                      'Project actions for {{value0}}',
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
            }
          />
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.components.sidebar.WorktreeList.2ef41bf9a7', 'Project actions')}
          </TooltipContent>
        </Tooltip>
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
          <DropdownMenuItem onClick={() => props.onOpenSettings(props.repo.id)}>
            <SlidersHorizontal className="size-3.5" />
            {translate('auto.components.sidebar.WorktreeList.2cdffbc728', 'Project Settings')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              props.onOpenSettings(props.repo.id, getRepositoryIconSectionId(props.repo.id))
            }
          >
            <Shapes className="size-3.5" />
            {translate('auto.components.sidebar.WorktreeList.e82d3589a1', 'Change Project Icon')}
          </DropdownMenuItem>
          {isGitRepoKind(props.repo) ? (
            <DropdownMenuItem onClick={() => props.onOpenVisibility(props.repo.id)}>
              <Eye className="size-3.5" />
              {getWorktreeVisibilityMenuLabel(props.repo)}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => props.onCreateGroup(props.repo)}>
            <FolderPlus className="size-3.5" />
            {translate('auto.components.sidebar.WorktreeList.cbfd565f83', 'New group from project')}
          </DropdownMenuItem>
          {props.projectGroups.length > 0 ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput className="size-3.5" />
                {translate('auto.components.sidebar.WorktreeList.4a08fb55f2', 'Move to group')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {props.projectGroups.map((group) => (
                  <DropdownMenuItem
                    key={group.id}
                    disabled={props.repo.projectGroupId === group.id}
                    onClick={() => props.onMoveToGroup(props.repo, group.id)}
                  >
                    <span className="max-w-48 truncate">{group.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
          {props.repo.projectGroupId ? (
            <DropdownMenuItem onClick={() => props.onRemoveFromGroup(props.repo)}>
              <CircleX className="size-3.5" />
              {translate('auto.components.sidebar.WorktreeList.64e55f7f01', 'Remove from group')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => props.onRemove(props.repo)}>
            <Trash2 className="size-3.5" />
            {translate('auto.components.sidebar.WorktreeList.c83968f87f', 'Remove Project')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Tooltip>
        <TooltipTrigger
          render={
            createState.disabled ? (
              <span
                className={cn(
                  'inline-flex cursor-not-allowed transition-[margin,max-width,opacity] outline-none focus-visible:bg-accent',
                  REPO_HEADER_ACTION_REVEAL_CLASS
                )}
                data-repo-header-action=""
                tabIndex={0}
                aria-label={createState.ariaLabel}
                onKeyDown={stopRepoHeaderKeyboardToggle}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={handleRepoHeaderActionPointerDown}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground pointer-events-none size-5 shrink-0 opacity-60 transition-opacity"
                  aria-label={createState.ariaLabel}
                  disabled
                >
                  <Plus className="size-3" />
                </Button>
              </span>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className={REPO_HEADER_ACTION_BUTTON_CLASS}
                data-repo-header-action=""
                aria-label={createState.ariaLabel}
                onKeyDown={stopRepoHeaderKeyboardToggle}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  props.onCreate(props.repo.id)
                }}
              >
                <Plus className="size-3" />
              </Button>
            )
          }
        />
        <TooltipContent side="bottom" sideOffset={6}>
          {createState.tooltip}
        </TooltipContent>
      </Tooltip>
    </>
  )
}
