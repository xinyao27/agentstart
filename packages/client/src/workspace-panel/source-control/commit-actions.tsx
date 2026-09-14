import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  ArrowsDownUp,
  ArrowUp,
  CaretDown as ChevronDown,
  Check,
  CloudArrowUp as CloudUpload,
  GitPullRequest as GitPullRequestArrow,
  Plus
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'
import { ButtonGroup } from '~renderer/ui/button-group'
import { cn } from '~renderer/ui/class-names'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~renderer/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import type { DropdownActionKind, DropdownEntry } from './dropdown-items'
import type { PrimaryAction } from './primary-action'

const PRIMARY_ICONS: Partial<
  Record<
    PrimaryAction['kind'],
    React.ComponentType<{
      className?: string
      'aria-hidden'?: boolean | 'true' | 'false'
    }>
  >
> = {
  commit: Check,
  stage: Plus,
  push: ArrowUp,
  sync: ArrowsDownUp,
  publish: CloudUpload,
  create_pr_intent: GitPullRequestArrow,
  create_pr: GitPullRequestArrow
}

export function SourceControlCommitActions({
  dropdownItems,
  onDropdownAction,
  onPrimaryAction,
  primaryAction,
  showChevronSpinner,
  showComposer,
  showSpinner
}: {
  dropdownItems: DropdownEntry[]
  onDropdownAction: (kind: DropdownActionKind) => void
  onPrimaryAction: () => void
  primaryAction: PrimaryAction
  showChevronSpinner: boolean
  showComposer: boolean
  showSpinner: boolean
}): React.JSX.Element {
  const PrimaryIcon = PRIMARY_ICONS[primaryAction.kind]
  const moreCommitAndRemoteActionsLabel = translate(
    'auto.components.workspacePanel.SourceControl.cc199ccc5f',
    'More commit and remote actions'
  )
  const moreActionsLabel = translate(
    'auto.components.workspacePanel.SourceControl.4d6e1fd7f3',
    'More actions'
  )

  return (
    <div
      className={cn(showComposer ? 'mt-1 flex items-stretch gap-1' : 'flex items-stretch gap-1')}
    >
      <ButtonGroup className="flex-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="flex flex-1">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={primaryAction.disabled}
                  onClick={onPrimaryAction}
                  className="w-full px-3 text-[11px]"
                  title={primaryAction.title}
                >
                  {showSpinner ? (
                    <LoadingIndicator className="size-3.5" />
                  ) : PrimaryIcon ? (
                    <PrimaryIcon className="size-3.5" aria-hidden="true" />
                  ) : null}
                  {primaryAction.label}
                </Button>
              </span>
            }
          />
          <TooltipContent side="top" sideOffset={6} className="max-w-72">
            {primaryAction.title}
          </TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex shrink-0">
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        className={cn('px-1.5 ', primaryAction.disabled && 'opacity-50')}
                        aria-label={moreCommitAndRemoteActionsLabel}
                        title={moreActionsLabel}
                      >
                        {showChevronSpinner ? (
                          <LoadingIndicator className="size-3.5" />
                        ) : (
                          <ChevronDown className="size-3.5" />
                        )}
                      </Button>
                    }
                  />
                </span>
              }
            />
            <TooltipContent side="top" sideOffset={6}>
              {moreCommitAndRemoteActionsLabel}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="min-w-[14rem]">
            {dropdownItems.map((entry, index) =>
              entry.kind === 'separator' ? (
                <DropdownMenuSeparator key={`sep-${index}`} />
              ) : (
                <Tooltip key={entry.kind}>
                  <TooltipTrigger
                    render={
                      <div className="block">
                        <DropdownMenuItem
                          disabled={entry.disabled}
                          title={entry.title}
                          variant={entry.variant}
                          className="w-full"
                          onClick={(event) => {
                            if (entry.disabled) {
                              event.preventDefault()
                              return
                            }
                            onDropdownAction(entry.kind)
                          }}
                          closeOnClick={false}
                        >
                          <span className="flex min-w-0 flex-col">
                            <span>{entry.label}</span>
                            {entry.hint ? (
                              <span className="text-muted-foreground truncate text-[10px]">
                                {entry.hint}
                              </span>
                            ) : null}
                          </span>
                        </DropdownMenuItem>
                      </div>
                    }
                  />
                  <TooltipContent side="left" sideOffset={8} className="max-w-72">
                    {entry.title}
                  </TooltipContent>
                </Tooltip>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
    </div>
  )
}
