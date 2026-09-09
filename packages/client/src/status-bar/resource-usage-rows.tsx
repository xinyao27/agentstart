import { ORPHAN_WORKTREE_ID } from '@yiru/protocol/terminal/session-identity'
import type { BrowserWorkspace } from '@yiru/protocol/workspace/browser-session'
import type { Worktree } from '@yiru/protocol/worktree/model'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  Globe,
  Trash as Trash2,
  CaretDown as ChevronDown,
  CaretRight as ChevronRight,
  X
} from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { UNATTRIBUTED_REPO_ID } from './merge-snapshot-and-sessions'
import { isResourceSessionActivationKey } from './resource-session-navigation'
import type { UnifiedSessionRow, UnifiedWorktreeRow } from './resource-usage-merge-types'
import { MetricPair, ROW_TRAILING_GUTTER_CLS, Sparkline } from './resource-usage-metrics'

function SessionRow({
  session,
  worktreeId,
  onNavigate,
  onKill
}: {
  session: UnifiedSessionRow
  worktreeId: string
  onNavigate: (tabId: string, paneKey: string | null) => void
  onKill: (session: UnifiedSessionRow) => void
}): React.JSX.Element {
  const clickable = session.tabId !== null && session.bound
  const handleClick = (): void => {
    if (clickable && session.tabId) {
      onNavigate(session.tabId, session.paneKey)
    }
  }

  return (
    <div
      className={cn(
        'group/sessrow flex items-center gap-2 pl-10 pr-3 py-1.5 outline-none',
        clickable && 'cursor-pointer hover:bg-accent/40 focus-visible:bg-accent/40'
      )}
      onClick={clickable ? handleClick : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : -1}
      onKeyDown={
        clickable
          ? (e) => {
              if (isResourceSessionActivationKey(e.key)) {
                e.preventDefault()
                handleClick()
              }
            }
          : undefined
      }
      data-worktree-id={worktreeId}
    >
      <span
        className={cn(
          'size-1.5 shrink-0',
          session.bound ? 'bg-emerald-500' : 'bg-muted-foreground/40'
        )}
      />
      <span className="text-muted-foreground min-w-0 flex-1 truncate text-[11px]">
        {session.label}
      </span>
      <MetricPair cpu={session.cpu} memory={session.memory} size="small" />
      {/* Why: kill X lives inside the shared trailing gutter so CPU/Memory
          columns stay aligned with the column header (whose gutter is empty).
          Bound sessions hide the X until the row is hovered/focused (calm
          list); orphan sessions show it always so the "this is reclaimable"
          affordance survives. Mirrors Settings > Manage Sessions. */}
      <span className={ROW_TRAILING_GUTTER_CLS}>
        <Button
          variant="destructive"
          size="xs"
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onKill(session)
          }}
          className={cn(
            'h-auto border-0 gap-0 font-normal focus-visible:bg-destructive/10 focus-visible:text-destructive',
            'p-0.5 text-muted-foreground transition-opacity hover:bg-destructive/10 hover:text-destructive',
            session.bound &&
              'can-hover:opacity-0 group-hover/sessrow:opacity-100 group-focus-within/sessrow:opacity-100 focus-visible:opacity-100'
          )}
          aria-label={translate(
            'auto.components.status.bar.ResourceUsageStatusSegment.fa6d36758d',
            'Kill session {{value0}}',
            { value0: session.sessionId }
          )}
        >
          <X className="size-3" />
        </Button>
      </span>
    </div>
  )
}

function BrowserRow({ browser }: { browser: BrowserWorkspace }): React.JSX.Element {
  const label = browser.title?.trim() || browser.label?.trim() || browser.url
  return (
    <div className="flex items-center gap-2 py-1.5 pr-3 pl-10">
      <Globe className="text-muted-foreground size-3 shrink-0" aria-hidden />
      <span className="text-muted-foreground min-w-0 flex-1 truncate text-[11px]">{label}</span>
      <MetricPair cpu={null} memory={null} size="small" />
      <span className={ROW_TRAILING_GUTTER_CLS} aria-hidden />
    </div>
  )
}

// ─── Worktree row ───────────────────────────────────────────────────

export function WorktreeRow({
  worktree,
  storeRecord,
  activeWorktreeId,
  isCollapsed,
  onToggle,
  onNavigate,
  onDelete,
  onKillSession,
  navigateToTab
}: {
  worktree: UnifiedWorktreeRow
  storeRecord: Worktree | null
  activeWorktreeId: string | null
  isCollapsed: boolean
  onToggle: () => void
  onNavigate: () => void
  onDelete: () => void
  onKillSession: (session: UnifiedSessionRow) => void
  navigateToTab: (tabId: string, paneKey: string | null) => void
}): React.JSX.Element {
  const hasResources = worktree.sessions.length > 0 || worktree.browsers.length > 0
  // Why: synthetic buckets (orphan/unattributed) have no sidebar target to
  // reveal. Real and SSH-resolved worktrees both qualify for navigation —
  // navigateToWorktree handles the no-store-record case internally by
  // bailing out of activateAndRevealWorktree if the worktree isn't known.
  const isSynthetic =
    worktree.worktreeId === ORPHAN_WORKTREE_ID || worktree.repoId === UNATTRIBUTED_REPO_ID
  const isNavigable = !isSynthetic
  // Why: Delete acts on a sidebar worktree record; without
  // one (synthesized SSH rows whose worktreeId isn't in worktreeById, or
  // synthetic buckets), or for the active worktree, we hide it but keep the
  // row clickable for navigation.
  const showWorktreeActions =
    !isSynthetic && storeRecord !== null && worktree.worktreeId !== activeWorktreeId
  const isMainWorktree = storeRecord?.isMainWorktree ?? false
  const rowLabel = storeRecord?.displayName?.trim() || worktree.worktreeName

  return (
    <div className="border-border/20 border-b last:border-b-0">
      <div className="group/wtrow hover:bg-muted/60 ml-2 flex items-center transition-colors">
        {hasResources ? (
          <Button
            variant="ghost"
            size="xs"
            type="button"
            onClick={onToggle}
            className="focus-visible:bg-accent h-auto gap-0 border-0 py-2 pr-0.5 pl-2 font-normal"
            aria-label={
              isCollapsed
                ? translate(
                    'auto.components.status.bar.ResourceUsageStatusSegment.c4a8968bdd',
                    'Expand workspace'
                  )
                : translate(
                    'auto.components.status.bar.ResourceUsageStatusSegment.bbcd9b7b85',
                    'Collapse workspace'
                  )
            }
          >
            {isCollapsed ? (
              <ChevronRight className="text-muted-foreground h-3 w-3" />
            ) : (
              <ChevronDown className="text-muted-foreground h-3 w-3" />
            )}
          </Button>
        ) : (
          <span
            className="w-[calc(0.5rem+0.75rem+0.125rem)] shrink-0 py-2 pr-0.5 pl-2"
            aria-hidden
          />
        )}
        <Button
          variant="ghost"
          size="default"
          type="button"
          onClick={onNavigate}
          aria-label={translate(
            'auto.components.status.bar.ResourceUsageStatusSegment.d659d71d2d',
            'Resume workspace {{value0}}',
            { value0: rowLabel }
          )}
          className="focus-visible:bg-accent flex min-w-0 flex-1 justify-start gap-1.5 border-0 pr-2 pl-1 text-left font-normal whitespace-normal"
          disabled={!isNavigable}
        >
          <span className="truncate text-xs font-medium">{rowLabel}</span>
        </Button>
        <div className="flex shrink-0 items-center gap-2 pr-3">
          <div className="relative">
            {/* Why: no-hover devices show the action overlay by default, so
                the sparkline yields there just like it does during hover. */}
            <span
              className={cn(
                'block transition-opacity',
                showWorktreeActions &&
                  'group-hover/wtrow:opacity-0 group-hover/wtrow:pointer-events-none group-focus-within/wtrow:opacity-0 group-focus-within/wtrow:pointer-events-none [@media(hover:none)]:opacity-0 [@media(hover:none)]:pointer-events-none'
              )}
              aria-hidden={showWorktreeActions ? undefined : true}
            >
              <Sparkline samples={worktree.history} />
            </span>
            {showWorktreeActions && (
              <div className="can-hover:opacity-0 can-hover:pointer-events-none absolute inset-0 flex items-center justify-end gap-0.5 transition-opacity group-focus-within/wtrow:pointer-events-auto group-focus-within/wtrow:opacity-100 group-hover/wtrow:pointer-events-auto group-hover/wtrow:opacity-100">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="destructive"
                        size="xs"
                        type="button"
                        onClick={onDelete}
                        disabled={isMainWorktree}
                        aria-label={translate(
                          'auto.components.status.bar.ResourceUsageStatusSegment.16bc3c998a',
                          'Delete workspace {{value0}}',
                          { value0: rowLabel }
                        )}
                        className={cn(
                          'h-auto border-0 gap-0 font-normal focus-visible:bg-destructive/10 focus-visible:text-destructive',
                          'p-0.5 text-muted-foreground transition-colors',
                          isMainWorktree
                            ? 'opacity-40 cursor-not-allowed'
                            : 'hover:bg-destructive/10 hover:text-destructive'
                        )}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    }
                  />
                  <TooltipContent
                    side="top"
                    sideOffset={4}
                    className="z-[70] max-w-[200px] text-pretty"
                  >
                    {isMainWorktree
                      ? translate(
                          'auto.components.status.bar.ResourceUsageStatusSegment.946724a70a',
                          'The main workspace cannot be deleted.'
                        )
                      : translate(
                          'auto.components.status.bar.ResourceUsageStatusSegment.a82253b458',
                          'Delete workspace.'
                        )}
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
          <MetricPair cpu={worktree.cpu} memory={worktree.memory} />
          <span className={ROW_TRAILING_GUTTER_CLS} aria-hidden />
        </div>
      </div>

      {!isCollapsed &&
        worktree.sessions.map((session) => (
          <SessionRow
            key={session.sessionId}
            session={session}
            worktreeId={worktree.worktreeId}
            onNavigate={navigateToTab}
            onKill={onKillSession}
          />
        ))}
      {!isCollapsed &&
        worktree.browsers.map((browser) => <BrowserRow key={browser.id} browser={browser} />)}
    </div>
  )
}
