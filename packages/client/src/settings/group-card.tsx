import type React from 'react'
import { useState } from 'react'
import { CaretRight as ChevronRight } from '~renderer/icons/hugeicons'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import type { SettingsSearchEntry } from './search'
import { matchesSettingsSearch, normalizeSettingsSearchQuery } from './search'

type SettingsGroupCardProps = {
  /** Stable id used for the accordion toggle + aria wiring. */
  id: string
  icon: React.ReactNode
  title: React.ReactNode
  /** Plain-language current value shown in the collapsed summary row. */
  summary?: React.ReactNode
  open: boolean
  onToggle: () => void
  children: React.ReactNode
  /** Extra classes for the expanded body (e.g. full-height panes). */
  bodyClassName?: string
  /** Stretch the card and its expanded body to the pane's full height
   *  (single-card panes like Shortcuts that must fill the viewport). */
  fill?: boolean
}

/** Compact summary row that expands its group inline. The parent owns the
 *  open state so opening one row can collapse the previously open one
 *  (accordion behavior) and search can force a group open. */
export function SettingsGroupCard({
  id,
  icon,
  title,
  summary,
  open,
  onToggle,
  children,
  bodyClassName,
  fill = false
}: SettingsGroupCardProps): React.JSX.Element {
  const contentId = `settings-group-${id}`
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border/50 bg-card transition-colors',
        open && 'border-ring/40',
        fill && 'flex h-full min-h-0 flex-col'
      )}
    >
      <Button
        variant="ghost"
        size="default"
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={onToggle}
        className="hover:bg-accent/15 flex h-auto w-full justify-start gap-3.5 border-0 py-3.5 text-left font-normal whitespace-normal transition-colors"
      >
        <span className="bg-secondary text-foreground grid size-8 shrink-0 place-items-center rounded-md [&_svg]:size-4">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          {!open && summary ? (
            <span className="text-muted-foreground block truncate text-xs">{summary}</span>
          ) : null}
        </span>
        <ChevronRight
          className={cn(
            'size-[18px] shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-90 text-foreground'
          )}
        />
      </Button>
      <div
        className={cn(
          'grid overflow-hidden transition-[grid-template-rows,opacity,border-color] duration-200 ease-out motion-reduce:transition-none',
          open
            ? 'grid-rows-[1fr] border-t border-border/50 opacity-100'
            : 'grid-rows-[0fr] border-t border-transparent opacity-0',
          fill && 'min-h-0 flex-1'
        )}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div id={contentId} role="region" className={cn('px-4 pt-1 pb-4', bodyClassName)}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

export type SettingsGroup = {
  id: string
  icon: React.ReactNode
  title: React.ReactNode
  /** Collapsed summary; falls back to the first search entry's description. */
  summary?: React.ReactNode
  /** Union of the group's rows' entries — decides search visibility + force-open. */
  searchEntries: SettingsSearchEntry[]
  /** Always render and expand this group, even while searching — e.g. a row
   *  holding unsaved edits must stay reachable. */
  forceVisible?: boolean
  content: React.ReactNode
  bodyClassName?: string
  fill?: boolean
}

type SettingsGroupCardsProps = {
  groups: readonly SettingsGroup[]
  /** Group open on first render outside search. Defaults to the first group. */
  defaultOpenId?: string | null
  className?: string
}

/** The Appearance-pane grammar for a whole pane: a stack of accordion cards
 *  where one group is open at a time, and a search query hides non-matching
 *  groups while force-opening the matching ones so their rows are revealed. */
export function SettingsGroupCards({
  groups,
  defaultOpenId,
  className
}: SettingsGroupCardsProps): React.JSX.Element {
  const searchQuery = useAppStore((state) => state.settingsSearchQuery)
  const isSearching = normalizeSettingsSearchQuery(searchQuery).length > 0
  const [manuallyOpenId, setManuallyOpenId] = useState<string | null>(
    defaultOpenId ?? groups[0]?.id ?? null
  )

  const visibleGroups = isSearching
    ? groups.filter(
        (group) => group.forceVisible || matchesSettingsSearch(searchQuery, group.searchEntries)
      )
    : groups

  function isGroupOpen(group: SettingsGroup): boolean {
    if (isSearching) {
      return group.forceVisible || matchesSettingsSearch(searchQuery, group.searchEntries)
    }
    return manuallyOpenId === group.id
  }

  return (
    <div className={cn('space-y-2.5', className)}>
      {visibleGroups.map((group) => (
        <SettingsGroupCard
          key={group.id}
          id={group.id}
          icon={group.icon}
          title={group.title}
          summary={group.summary ?? group.searchEntries[0]?.description}
          open={isGroupOpen(group)}
          onToggle={() => setManuallyOpenId((current) => (current === group.id ? null : group.id))}
          bodyClassName={group.bodyClassName}
          fill={group.fill}
        >
          {group.content}
        </SettingsGroupCard>
      ))}
    </div>
  )
}
