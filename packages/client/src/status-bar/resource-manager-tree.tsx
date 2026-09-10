import type { MemorySnapshot } from '@agentstart/protocol/diagnostics/memory-values'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { CaretRight as ChevronRight } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import type { UnifiedProjectGroup, UnifiedSessionRow } from './resource-usage-merge-types'
import {
  AppSection,
  CPU_COLUMN_CLS,
  MEM_COLUMN_CLS,
  METRIC_COLUMNS_CLS,
  ROW_TRAILING_GUTTER_CLS,
  type SortOption
} from './resource-usage-metrics'
import { ResourceTree } from './resource-usage-tree'

type ResourceManagerTreeProps = {
  snapshot: MemorySnapshot | null
  repos: UnifiedProjectGroup[]
  sortOption: SortOption
  collapsedRepos: Set<string>
  collapsedWorktrees: Set<string>
  activeWorktreeId: string | null
  isAppCollapsed: boolean
  isDaemonUnreachable: boolean
  oldWorkspaceCount: number
  orphanCount: number
  setPopoverBodyNode: (node: HTMLDivElement | null) => void
  onSortChange: (sort: SortOption) => void
  onToggleRepo: (repoId: string) => void
  onToggleWorktree: (worktreeId: string) => void
  onNavigateWorktree: (worktreeId: string) => void
  onNavigateTab: (tabId: string, paneKey: string | null) => void
  onDeleteWorktree: (worktreeId: string) => void
  onKillSession: (session: UnifiedSessionRow) => void
  onToggleApp: () => void
  onOpenWorkspaceCleanup: () => void
  onKillOrphans: () => void
}

export function ResourceManagerTree({
  snapshot,
  repos,
  sortOption,
  collapsedRepos,
  collapsedWorktrees,
  activeWorktreeId,
  isAppCollapsed,
  isDaemonUnreachable,
  oldWorkspaceCount,
  orphanCount,
  setPopoverBodyNode,
  onSortChange,
  onToggleRepo,
  onToggleWorktree,
  onNavigateWorktree,
  onNavigateTab,
  onDeleteWorktree,
  onKillSession,
  onToggleApp,
  onOpenWorkspaceCleanup,
  onKillOrphans
}: ResourceManagerTreeProps): React.JSX.Element {
  return (
    <>
      <div ref={setPopoverBodyNode} tabIndex={-1} className="flex h-[420px] flex-col outline-none">
        {repos.length > 0 || snapshot ? (
          <ResourceSortHeader sortOption={sortOption} onSortChange={onSortChange} />
        ) : null}
        <div className="scrollbar-sleek flex-1 overflow-y-auto">
          {repos.length > 0 ? (
            <ResourceTree
              repos={repos}
              sortOption={sortOption}
              collapsedRepos={collapsedRepos}
              toggleRepo={onToggleRepo}
              collapsedWorktrees={collapsedWorktrees}
              activeWorktreeId={activeWorktreeId}
              toggleWorktree={onToggleWorktree}
              navigateToWorktree={onNavigateWorktree}
              navigateToTab={onNavigateTab}
              onDelete={onDeleteWorktree}
              onKillSession={onKillSession}
            />
          ) : null}
          {repos.length === 0 && snapshot ? (
            <div className="text-muted-foreground px-3 py-4 text-center text-xs">
              {translate(
                'auto.components.status.bar.ResourceUsageStatusSegment.27a74f91f0',
                'Nothing running right now'
              )}
            </div>
          ) : null}
          {snapshot ? (
            <AppSection app={snapshot.app} isCollapsed={isAppCollapsed} onToggle={onToggleApp} />
          ) : null}
          {!snapshot && !isDaemonUnreachable ? (
            <div className="text-muted-foreground px-3 py-4 text-center text-xs">
              {translate(
                'auto.components.status.bar.ResourceUsageStatusSegment.888dad8c55',
                'Loading…'
              )}
            </div>
          ) : null}
        </div>
      </div>
      <div className="border-border/50 shrink-0 border-t px-3 py-2">
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={onOpenWorkspaceCleanup}
          className="border-border/70 hover:bg-accent/60 focus-visible:bg-accent/60 relative w-full gap-0 px-2.5 py-1.5 text-xs whitespace-normal transition-colors"
        >
          <span className="min-w-0 truncate px-4 text-center">
            {translate(
              'auto.components.status.bar.ResourceUsageStatusSegment.92924a14e3',
              'Review inactive workspaces ({{value0}})',
              { value0: oldWorkspaceCount }
            )}
          </span>
          <ChevronRight className="text-muted-foreground absolute right-2.5 size-3.5" aria-hidden />
        </Button>
        {orphanCount > 0 ? (
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={onKillOrphans}
            className="border-border/70 hover:bg-accent/60 focus-visible:bg-accent/60 mt-2 w-full gap-0 px-2.5 py-1.5 text-xs whitespace-normal transition-colors"
          >
            {translate(
              orphanCount === 1
                ? 'auto.components.status.bar.ResourceUsageStatusSegment.c7e3b1a0d9f2'
                : 'auto.components.status.bar.ResourceUsageStatusSegment.d8f4c2b1e0a3',
              orphanCount === 1
                ? 'Kill {{value0}} orphan terminal'
                : 'Kill {{value0}} orphan terminals',
              { value0: orphanCount }
            )}
          </Button>
        ) : null}
      </div>
    </>
  )
}

function ResourceSortHeader({
  sortOption,
  onSortChange
}: {
  sortOption: SortOption
  onSortChange: (sort: SortOption) => void
}): React.JSX.Element {
  return (
    <div className="bg-muted/30 border-border/50 flex shrink-0 items-center justify-between border-b px-3 py-1 text-[10px] tracking-wide uppercase">
      <SortButton
        label={translate(
          'auto.components.status.bar.ResourceUsageStatusSegment.2aa2de6cb9',
          'Name'
        )}
        selected={sortOption === 'name'}
        onClick={() => onSortChange('name')}
      />
      <div className="flex shrink-0 items-center gap-2">
        <div className={cn(METRIC_COLUMNS_CLS, 'text-[10px]')}>
          <SortButton
            label={translate(
              'auto.components.status.bar.ResourceUsageStatusSegment.298f4be7f2',
              'CPU'
            )}
            selected={sortOption === 'cpu'}
            onClick={() => onSortChange('cpu')}
            className={CPU_COLUMN_CLS}
          />
          <SortButton
            label={translate(
              'auto.components.status.bar.ResourceUsageStatusSegment.1b24a32d3a',
              'Memory'
            )}
            selected={sortOption === 'memory'}
            onClick={() => onSortChange('memory')}
            className={MEM_COLUMN_CLS}
          />
        </div>
        <span className={ROW_TRAILING_GUTTER_CLS} aria-hidden />
      </div>
    </div>
  )
}

function SortButton({
  label,
  selected,
  onClick,
  className
}: {
  label: string
  selected: boolean
  onClick: () => void
  className?: string
}): React.JSX.Element {
  return (
    <Button
      variant="quiet"
      size="xs"
      type="button"
      onClick={onClick}
      className={cn(
        'h-auto gap-0 border-0 p-0',
        className,
        selected ? 'text-foreground font-semibold' : 'text-muted-foreground/80'
      )}
      aria-pressed={selected}
    >
      {label}
    </Button>
  )
}
