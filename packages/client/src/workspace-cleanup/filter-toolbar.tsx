import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { MagnifyingGlass as Search, SlidersHorizontal } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '~renderer/ui/dropdown-menu'
import { Input } from '~renderer/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import type {
  WorkspaceCleanupContextFilter,
  WorkspaceCleanupFilters,
  WorkspaceCleanupGitFilter,
  WorkspaceCleanupReviewFilter,
  WorkspaceCleanupSortDirection,
  WorkspaceCleanupSortKey,
  WorkspaceCleanupTimeFilter
} from './presentation'

type WorkspaceCleanupFilterToolbarProps = {
  filters: WorkspaceCleanupFilters
  showRestoreIgnored: boolean
  sortKey: WorkspaceCleanupSortKey
  sortDirection: WorkspaceCleanupSortDirection
  onFiltersChange: (filters: WorkspaceCleanupFilters) => void
  onSortKeyChange: (sortKey: WorkspaceCleanupSortKey) => void
  onSortDirectionChange: (direction: WorkspaceCleanupSortDirection) => void
  onRestoreIgnored: () => void
}

export function WorkspaceCleanupFilterToolbar({
  filters,
  showRestoreIgnored,
  sortKey,
  sortDirection,
  onFiltersChange,
  onSortKeyChange,
  onSortDirectionChange,
  onRestoreIgnored
}: WorkspaceCleanupFilterToolbarProps): React.JSX.Element {
  const updateFilter = <K extends keyof WorkspaceCleanupFilters>(
    key: K,
    value: WorkspaceCleanupFilters[K]
  ): void => {
    onFiltersChange({ ...filters, [key]: value })
  }
  const hasHiddenControls = hasActivePanelControls(filters, sortKey, sortDirection)
  const resetPanelControls = (): void => {
    onFiltersChange({ ...filters, time: 'all', review: 'all', git: 'all', context: 'all' })
    onSortKeyChange('activity')
    onSortDirectionChange('asc')
  }

  return (
    <div className="border-border bg-muted/15 flex items-center gap-2 border-b px-3 py-2">
      <div className="relative min-w-0 flex-1">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
        <Input
          value={filters.query}
          onChange={(event) => updateFilter('query', event.target.value)}
          placeholder={translate(
            'auto.components.workspace.cleanup.WorkspaceCleanupDialog.searchPlaceholder',
            'Search workspaces'
          )}
          className="h-8 pl-8 text-xs"
        />
      </div>
      <DropdownMenu modal={false}>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-sm"
                    type="button"
                    aria-label={translate(
                      'auto.components.workspace.cleanup.WorkspaceCleanupDialog.efb3843e75',
                      'Filter and sort workspaces'
                    )}
                    className="relative shrink-0"
                  >
                    <SlidersHorizontal className="size-3.5" />
                    {hasHiddenControls ? (
                      <span
                        aria-hidden="true"
                        className="bg-primary absolute -top-0.5 -right-0.5 size-2"
                      />
                    ) : null}
                  </Button>
                }
              />
            }
          />
          <TooltipContent side="top" sideOffset={4}>
            {translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.efb3843e75',
              'Filter and sort workspaces'
            )}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" sideOffset={6} className="w-64 pb-2">
          <DropdownMenuLabel>
            {translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.93b7381d50',
              'Filters'
            )}
          </DropdownMenuLabel>
          <WorkspaceCleanupMenuSub<WorkspaceCleanupTimeFilter>
            label={translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.ageFilter',
              'Age'
            )}
            value={filters.time}
            options={[
              ['all', 'Any age'],
              ['30d', '30d+'],
              ['90d', '90d+'],
              ['archived', 'Archived']
            ]}
            onChange={(value) => updateFilter('time', value)}
          />
          <WorkspaceCleanupMenuSub<WorkspaceCleanupReviewFilter>
            label={translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.reviewFilter',
              'Review'
            )}
            value={filters.review}
            options={[
              ['all', 'Any review'],
              ['no-review', 'No PR'],
              ['has-review', 'Has PR'],
              ['open-review', 'Open'],
              ['closed-review', 'Closed']
            ]}
            onChange={(value) => updateFilter('review', value)}
          />
          <WorkspaceCleanupMenuSub<WorkspaceCleanupGitFilter>
            label={translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.gitFilter',
              'Git'
            )}
            value={filters.git}
            options={[
              ['all', 'Any git'],
              ['clean', 'Clean'],
              ['dirty', 'Dirty'],
              ['unpushed', 'Unpushed'],
              ['unknown', 'Unknown']
            ]}
            onChange={(value) => updateFilter('git', value)}
          />
          <WorkspaceCleanupMenuSub<WorkspaceCleanupContextFilter>
            label={translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.contextFilter',
              'Context'
            )}
            value={filters.context}
            options={[
              ['all', 'Any context'],
              ['has-context', 'Has context'],
              ['no-context', 'No context']
            ]}
            onChange={(value) => updateFilter('context', value)}
          />
          <DropdownMenuSeparator />
          <DropdownMenuLabel>
            {translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.a615e24679',
              'Sort'
            )}
          </DropdownMenuLabel>
          <WorkspaceCleanupMenuSub<WorkspaceCleanupSortKey>
            label={translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.sortBy',
              'Sort by'
            )}
            value={sortKey}
            options={[
              ['activity', 'Activity'],
              ['name', 'Name'],
              ['repo', 'Repo'],
              ['review', 'Review'],
              ['git', 'Git']
            ]}
            onChange={onSortKeyChange}
          />
          <WorkspaceCleanupMenuSub<WorkspaceCleanupSortDirection>
            label={translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.sortDirection',
              'Direction'
            )}
            value={sortDirection}
            options={[
              ['asc', 'Ascending'],
              ['desc', 'Descending']
            ]}
            onChange={onSortDirectionChange}
          />
          {showRestoreIgnored ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onRestoreIgnored}>
                {translate(
                  'auto.components.workspace.cleanup.WorkspaceCleanupDialog.aaee139eab',
                  'Restore ignored suggestions'
                )}
              </DropdownMenuItem>
            </>
          ) : null}
          {hasHiddenControls ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={resetPanelControls}>
                {translate(
                  'auto.components.workspace.cleanup.WorkspaceCleanupDialog.e94b1f8bb4',
                  'Clear filters'
                )}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function WorkspaceCleanupMenuSub<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (value: T) => void
}): React.JSX.Element {
  const valueLabel = options.find(([optionValue]) => optionValue === value)?.[1] ?? value
  const selectValue = (next: string): void => {
    const option = options.find(([optionValue]) => optionValue === next)
    if (option) {
      onChange(option[0])
    }
  }
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <span className="truncate">{label}</span>
          <span className="text-muted-foreground truncate text-[11px] font-medium">
            {valueLabel}
          </span>
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-44">
        <DropdownMenuRadioGroup value={value} onValueChange={selectValue}>
          {options.map(([optionValue, optionLabel]) => (
            <DropdownMenuRadioItem
              key={optionValue}
              value={optionValue}
              onClick={(event) => event.preventDefault()}
              closeOnClick={false}
            >
              {optionLabel}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function hasActivePanelControls(
  filters: WorkspaceCleanupFilters,
  sortKey: WorkspaceCleanupSortKey,
  sortDirection: WorkspaceCleanupSortDirection
): boolean {
  return (
    filters.time !== 'all' ||
    filters.review !== 'all' ||
    filters.git !== 'all' ||
    filters.context !== 'all' ||
    sortKey !== 'activity' ||
    sortDirection !== 'asc'
  )
}
