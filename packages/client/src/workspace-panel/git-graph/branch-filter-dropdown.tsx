import type React from 'react'
import { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { GitBranch, MagnifyingGlass } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { Checkbox } from '~renderer/ui/checkbox'
import { Input } from '~renderer/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '~renderer/ui/popover'
import { ScrollArea } from '~renderer/ui/scroll-area'

import type { GitGraphBranchOption } from './branch-filter'

// Why: Base UI's dropdown/menu primitives close on item activation, which
// fights a multi-select checklist — this reimplements the shape of Git
// Graph's `dropdown.ts` (filter input + toggleable rows + "Show All") on top
// of our Popover + Checkbox primitives instead of porting its bespoke class.
export function GitGraphBranchFilterDropdown({
  options,
  selectedRefIds,
  onChange
}: {
  options: readonly GitGraphBranchOption[]
  selectedRefIds: readonly string[] | null
  onChange: (refIds: string[] | null) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')

  const filteredOptions = (() => {
    const normalized = filter.trim().toLowerCase()
    if (!normalized) {
      return options
    }
    return options.filter((option) => option.name.toLowerCase().includes(normalized))
  })()

  const showingAll = selectedRefIds === null
  const selectedSet = new Set(selectedRefIds ?? [])

  const toggleOption = (refId: string): void => {
    const base = showingAll ? options.map((option) => option.refId) : Array.from(selectedSet)
    const next = base.includes(refId) ? base.filter((id) => id !== refId) : [...base, refId]
    onChange(next)
  }

  const label =
    showingAll || selectedSet.size === options.length
      ? translate(
          'auto.components.workspacePanel.git-graph.BranchFilterDropdown.a1b2c3d4e5',
          'All branches'
        )
      : translate(
          'auto.components.workspacePanel.git-graph.BranchFilterDropdown.b2c3d4e5f6',
          '{{value0}} branches',
          { value0: String(selectedSet.size) }
        )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" size="xs" className="gap-1.5">
            <GitBranch className="size-3.5" />
            <span className="max-w-32 truncate">{label}</span>
          </Button>
        }
      />
      <PopoverContent align="start" className="w-64 p-0">
        <div className="border-border flex items-center gap-1.5 border-b px-2 py-1.5">
          <MagnifyingGlass className="text-muted-foreground size-3.5 shrink-0" />
          <Input
            variant="chrome-free"
            size="xs"
            autoFocus
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={translate(
              'auto.components.workspacePanel.git-graph.BranchFilterDropdown.c3d4e5f6a7',
              'Filter branches…'
            )}
            className="flex-1"
          />
        </div>
        <ScrollArea className="max-h-64" viewportClassName="p-1">
          <div
            role="menuitemcheckbox"
            aria-checked={showingAll}
            tabIndex={0}
            className="hover:bg-accent focus-visible:bg-accent flex w-full cursor-pointer items-center gap-2 px-2 py-1 text-left text-xs"
            onClick={() => onChange(null)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onChange(null)
              }
            }}
          >
            <Checkbox checked={showingAll} tabIndex={-1} className="pointer-events-none" />
            {translate(
              'auto.components.workspacePanel.git-graph.BranchFilterDropdown.d4e5f6a7b8',
              'Show all branches'
            )}
          </div>
          {filteredOptions.map((option) => {
            const checked = showingAll || selectedSet.has(option.refId)
            return (
              <div
                key={option.refId}
                role="menuitemcheckbox"
                aria-checked={checked}
                tabIndex={0}
                className="hover:bg-accent focus-visible:bg-accent flex w-full cursor-pointer items-center gap-2 px-2 py-1 text-left text-xs"
                onClick={() => toggleOption(option.refId)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    toggleOption(option.refId)
                  }
                }}
              >
                <Checkbox checked={checked} tabIndex={-1} className="pointer-events-none" />
                <span className="truncate">{option.name}</span>
              </div>
            )
          })}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
