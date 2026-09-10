import type { NestedRepoScanResult } from '@agentstart/protocol/project/group-model'
import type { Dispatch, SetStateAction } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { GitMerge } from '~renderer/icons/hugeicons'
import { getRepoDisplayLabelKey, getRepoDisplayLabelsByPath } from '~renderer/repo/display-labels'
import { Checkbox } from '~renderer/ui/checkbox'
import { cn } from '~renderer/ui/class-names'

function NestedRepoSelectAllRow({
  total,
  selectedCount,
  disabled,
  onToggle
}: {
  total: number
  selectedCount: number
  disabled: boolean
  onToggle: () => void
}) {
  const allSelected = total > 0 && selectedCount === total
  const noneSelected = selectedCount === 0
  const isMixed = !allSelected && !noneSelected
  return (
    <label className="bg-muted/30 hover:bg-muted/50 flex min-w-0 cursor-pointer items-center gap-2.5 px-3 py-2 text-sm">
      <Checkbox
        checked={allSelected}
        indeterminate={isMixed}
        disabled={disabled}
        onCheckedChange={onToggle}
        aria-label={
          allSelected
            ? translate('auto.components.repo.NestedRepoChecklist.929734aea5', 'Deselect all')
            : translate('auto.components.repo.NestedRepoChecklist.91b5bcadb6', 'Select all')
        }
      />
      <span className="text-foreground min-w-0 truncate text-[12.5px] font-semibold">
        {allSelected
          ? translate('auto.components.repo.NestedRepoChecklist.929734aea5', 'Deselect all')
          : translate('auto.components.repo.NestedRepoChecklist.91b5bcadb6', 'Select all')}
      </span>
      <span className="text-muted-foreground ml-auto shrink-0 text-[11px]">
        {selectedCount} {translate('auto.components.repo.NestedRepoChecklist.ea54c7bf8f', 'of')}{' '}
        {total} {translate('auto.components.repo.NestedRepoChecklist.f7e1170567', 'selected')}
      </span>
    </label>
  )
}

export function NestedRepoChecklist({
  scan,
  selectedPaths,
  onSelectedPathsChange,
  disabled = false,
  className
}: {
  scan: NestedRepoScanResult
  selectedPaths: Set<string>
  onSelectedPathsChange: Dispatch<SetStateAction<Set<string>>>
  disabled?: boolean
  className?: string
}) {
  const displayLabelsByPath = (() => getRepoDisplayLabelsByPath(scan.repos))()

  return (
    <div
      className={cn(
        'flex max-h-64 min-h-0 min-w-0 max-w-full flex-col overflow-hidden rounded-md border border-border bg-background/60',
        className
      )}
    >
      <NestedRepoSelectAllRow
        total={scan.repos.length}
        selectedCount={selectedPaths.size}
        disabled={disabled}
        onToggle={() => {
          onSelectedPathsChange((previous) => {
            if (previous.size === scan.repos.length) {
              return new Set()
            }
            return new Set(scan.repos.map((repo) => repo.path))
          })
        }}
      />
      <ul className="scrollbar-sleek min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {scan.repos.map((repo) => (
          <li key={repo.path}>
            <label className="border-border hover:bg-accent flex max-w-full min-w-0 cursor-pointer items-center gap-2.5 overflow-hidden border-t px-3 py-2 text-sm">
              <Checkbox
                checked={selectedPaths.has(repo.path)}
                disabled={disabled}
                onCheckedChange={(checked) => {
                  onSelectedPathsChange((previous) => {
                    const next = new Set(previous)
                    if (checked) {
                      next.add(repo.path)
                    } else {
                      next.delete(repo.path)
                    }
                    return next
                  })
                }}
              />
              <GitMerge className="text-muted-foreground size-3.5 shrink-0" />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-[13px] font-medium',
                  selectedPaths.has(repo.path) ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {displayLabelsByPath.get(getRepoDisplayLabelKey(repo)) ?? repo.displayName}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
