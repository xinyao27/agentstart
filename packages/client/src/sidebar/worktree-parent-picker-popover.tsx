import type { Worktree } from '@agentstart/protocol/worktree/model'
import type { Popover as BasePopover } from '@base-ui/react/popover'
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { GitMerge } from '~renderer/icons/hugeicons'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { RepoBadgeMark } from '~renderer/repo/badge-label'
import { useAllWorktrees, useRepoMap, useWorktreeMap } from '~renderer/store/selectors'
import { useAppStore } from '~renderer/store/state'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '~renderer/ui/command'
import { Popover, PopoverAnchor, PopoverContent } from '~renderer/ui/popover'

import { WorktreeActivityStatusIndicator } from './worktree-activity-status-indicator'
import { branchDisplayName } from './worktree-card/presentation'
import { getEligibleWorktreeParents } from './worktree-parent-candidates'

type WorktreeParentPickerPopoverProps = {
  open: boolean
  childWorktreeId: string | null
  anchorElement: HTMLElement | null
  onOpenChange: (open: boolean) => void
}

type AnchorRect = Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>

type SelectParentArgs = {
  childWorktreeId: string | null
  parentWorktreeId: string
  assignWorktreeParent: (worktreeId: string, args: { parentWorktreeId: string }) => Promise<void>
  close: () => void
  showError: (message: string) => void
}

function getAnchorRect(anchorElement: HTMLElement | null): AnchorRect | null {
  return anchorElement?.getBoundingClientRect() ?? null
}

function getWorktreeParentPickerItemValue(candidate: Worktree): string {
  return `${candidate.displayName} ${branchDisplayName(candidate.branch)} ${candidate.path}`
}

function selectWorktreeParent({
  childWorktreeId,
  parentWorktreeId,
  assignWorktreeParent,
  close,
  showError
}: SelectParentArgs): void {
  if (!childWorktreeId) {
    return
  }
  close()
  void assignWorktreeParent(childWorktreeId, { parentWorktreeId }).catch((error) => {
    console.error('Failed to set parent worktree:', error)
    showError(
      translate(
        'auto.components.sidebar.WorktreeParentPickerPopover.failedSetParent',
        'Failed to set parent worktree'
      )
    )
  })
}

function WorktreeParentPickerRow({
  candidate,
  isCurrent
}: {
  candidate: Worktree
  isCurrent: boolean
}): React.JSX.Element {
  const repo = useRepoMap().get(candidate.repoId)
  const branch = branchDisplayName(candidate.branch)

  return (
    <div className="flex min-w-0 flex-1 items-start gap-2">
      <WorktreeActivityStatusIndicator worktreeId={candidate.id} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] font-medium">{candidate.displayName}</span>
          {isCurrent ? (
            <span className="border-border bg-muted text-muted-foreground shrink-0 rounded border px-1.5 py-px text-[9px] leading-none font-medium">
              {translate('auto.components.sidebar.WorktreeParentPickerPopover.current', 'Current')}
            </span>
          ) : null}
        </div>
        <div className="text-muted-foreground mt-1 flex min-w-0 items-center gap-1.5 text-[11px] leading-none">
          {repo ? (
            <span className="border-border bg-accent text-foreground inline-flex max-w-[8rem] min-w-0 shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold">
              <RepoBadgeMark color={repo.badgeColor} />
              <span className="truncate lowercase">{repo.displayName}</span>
            </span>
          ) : null}
          <GitMerge className="size-3 shrink-0" />
          <span className="truncate">{branch}</span>
        </div>
      </div>
    </div>
  )
}

export function WorktreeParentPickerPopover({
  open,
  childWorktreeId,
  anchorElement,
  onOpenChange
}: WorktreeParentPickerPopoverProps): React.JSX.Element | null {
  const worktrees = useAllWorktrees()
  const worktreeMap = useWorktreeMap()
  const repoMap = useRepoMap()
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const lineageById = useProjectCatalog().worktreeLineageById
  const assignWorktreeParent = useAppStore((s) => s.assignWorktreeParent)
  const suppressInitialOutsideCloseRef = useRef(false)
  const [anchorRect, setAnchorRect] = useState<AnchorRect | null>(() =>
    getAnchorRect(anchorElement)
  )
  const child = childWorktreeId ? worktreeMap.get(childWorktreeId) : undefined
  const candidates = (() =>
    child
      ? getEligibleWorktreeParents({
          child,
          worktrees,
          lineageById,
          worktreeMap,
          repoMap
        })
      : [])()

  useLayoutEffect(() => {
    if (!open) {
      return
    }
    const updateAnchorRect = (): void => setAnchorRect(getAnchorRect(anchorElement))
    updateAnchorRect()
    window.addEventListener('resize', updateAnchorRect)
    window.addEventListener('scroll', updateAnchorRect, true)
    return () => {
      window.removeEventListener('resize', updateAnchorRect)
      window.removeEventListener('scroll', updateAnchorRect, true)
    }
  }, [anchorElement, open])

  useEffect(() => {
    if (!open) {
      suppressInitialOutsideCloseRef.current = false
      return
    }
    suppressInitialOutsideCloseRef.current = true
    // Why: the click that selected the dropdown item can reach Radix's newly
    // mounted popover as an outside interaction before the picker settles.
    const timerId = window.setTimeout(() => {
      suppressInitialOutsideCloseRef.current = false
    }, 150)
    return () => window.clearTimeout(timerId)
  }, [open])

  const handleSelect = (parentWorktreeId: string) => {
    selectWorktreeParent({
      childWorktreeId,
      parentWorktreeId,
      assignWorktreeParent,
      close: () => onOpenChange(false),
      showError: toast.error
    })
  }

  const handleOpenChange = (
    nextOpen: boolean,
    eventDetails: BasePopover.Root.ChangeEventDetails
  ) => {
    // Why: the click that selected the dropdown item can reach the newly
    // mounted popover as an outside interaction before the picker settles.
    if (
      !nextOpen &&
      suppressInitialOutsideCloseRef.current &&
      (eventDetails.reason === 'outside-press' || eventDetails.reason === 'focus-out')
    ) {
      eventDetails.cancel()
      return
    }
    onOpenChange(nextOpen)
  }

  if (!child || !anchorRect) {
    return null
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverAnchor>
        <span
          aria-hidden
          className="pointer-events-none fixed"
          style={{
            left: anchorRect.left,
            top: anchorRect.top,
            width: anchorRect.width,
            height: anchorRect.height
          }}
        />
      </PopoverAnchor>
      <PopoverContent align="start" side="right" sideOffset={8} className="w-80 p-0">
        <Command>
          <CommandInput
            placeholder={translate(
              'auto.components.sidebar.WorktreeParentPickerPopover.searchPlaceholder',
              'Search worktrees...'
            )}
            autoFocus
          />
          <CommandList className="max-h-72">
            <CommandEmpty>
              {translate(
                'auto.components.sidebar.WorktreeParentPickerPopover.empty',
                'No matching eligible worktrees.'
              )}
            </CommandEmpty>
            {candidates.map((candidate) => (
              <CommandItem
                key={candidate.id}
                value={getWorktreeParentPickerItemValue(candidate)}
                onSelect={() => handleSelect(candidate.id)}
                className="items-start px-2 py-2"
              >
                <WorktreeParentPickerRow
                  candidate={candidate}
                  isCurrent={activeWorktreeId === candidate.id}
                />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
