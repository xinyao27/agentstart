import type { WorkspaceCleanupCandidate } from '@agentstart/protocol'
import { canQueueWorkspaceCleanupCandidate } from '@agentstart/protocol/workspace/cleanup-policy'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  Warning as AlertTriangle,
  Check,
  Clock as Clock3,
  EyeSlash as EyeOff,
  FileText as FileWarning,
  GitMerge,
  GitPullRequest,
  MagnifyingGlass as Search,
  TerminalWindow as SquareTerminal,
  Trash as Trash2,
  type Icon,
  CaretDown as ChevronDown
} from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import {
  formatBranchSafetyDetails,
  formatContextDetails,
  formatGitStatus,
  getCandidateStatus,
  getContextCount,
  getDirtyGitLabel,
  getReviewPillTone,
  getWorkspaceCleanupBlockerLabels,
  shouldShowGitMetadataChip,
  type StatusPillTone
} from './candidate-row-data'
import { CandidateRowDetails } from './candidate-row-details'
import { getWorkspaceCleanupGitLabel, type WorkspaceCleanupReviewInfo } from './presentation'
import { StatusPill } from './status-pill'

type CandidateRowProps = {
  candidate: WorkspaceCleanupCandidate
  expanded: boolean
  failure?: string
  last: boolean
  lastActivityLabel: string
  removing?: boolean
  reviewInfo: WorkspaceCleanupReviewInfo
  selected: boolean
  onIgnore: (candidate: WorkspaceCleanupCandidate) => void
  onRemove: (candidate: WorkspaceCleanupCandidate) => void
  onToggleExpanded: (worktreeId: string) => void
  onToggleSelected: (worktreeId: string) => void
  onView: (candidate: WorkspaceCleanupCandidate) => void
}

function MetadataIconChip({
  icon: Icon,
  label,
  value,
  tone = 'neutral'
}: {
  icon: Icon
  label: string
  value?: string
  tone?: StatusPillTone
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              'inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5 text-[11px] font-medium',
              'border-border bg-background text-muted-foreground',
              tone === 'ready' &&
                'border-[color:color-mix(in_srgb,var(--git-decoration-added)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--git-decoration-added)_10%,transparent)] text-[var(--git-decoration-added)]',
              tone === 'review' && 'bg-muted text-foreground',
              tone === 'destructive' && 'border-destructive/30 text-destructive'
            )}
            aria-label={label}
          >
            <Icon className="size-3" aria-hidden="true" />
            {value ? <span>{value}</span> : null}
          </span>
        }
      />
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export const CandidateRow = function CandidateRow({
  candidate,
  expanded,
  failure,
  last,
  lastActivityLabel,
  removing = false,
  reviewInfo,
  selected,
  onIgnore,
  onRemove,
  onToggleExpanded,
  onToggleSelected,
  onView
}: CandidateRowProps): React.JSX.Element {
  const selectable = canQueueWorkspaceCleanupCandidate(candidate) && !removing
  const ignored = candidate.blockers.includes('dismissed')
  const blockers = getWorkspaceCleanupBlockerLabels(candidate)
  const contextDetails = formatContextDetails(candidate)
  const branchSafetyDetails = formatBranchSafetyDetails(candidate)
  const status = getCandidateStatus(candidate)
  const dirtyLabel = getDirtyGitLabel(candidate)
  const showGitMetadataChip = shouldShowGitMetadataChip(candidate)
  const contextCount = getContextCount(candidate)
  const hasExpandableDetails =
    blockers.length > 0 ||
    candidate.path.length > 0 ||
    candidate.branch.length > 0 ||
    contextDetails !== null ||
    branchSafetyDetails.length > 0

  return (
    <div
      className={cn(
        'group w-full border-b border-border/60 px-3 py-2.5 text-left text-foreground transition-colors hover:bg-accent/40',
        selected && 'bg-accent/30',
        last && 'border-b-0'
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5 gap-y-1">
        {selectable ? (
          <Button
            variant="outline"
            size="icon-xs"
            type="button"
            role="checkbox"
            aria-checked={selected}
            aria-label={translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.bbb1ab6a6f',
              'Select {{value0}}',
              { value0: candidate.displayName }
            )}
            onClick={() => onToggleSelected(candidate.worktreeId)}
            className="text-primary mt-0.5 flex size-4"
          >
            {selected ? <Check className="size-3" /> : null}
          </Button>
        ) : (
          <div className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        )}

        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="min-w-0 truncate text-sm font-medium">{candidate.displayName}</span>
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            <MetadataIconChip
              icon={Clock3}
              label={`${translate(
                'auto.components.workspace.cleanup.WorkspaceCleanupDialog.352f15d6fc',
                'Last active'
              )} ${lastActivityLabel}`}
              value={formatCompactActivityLabel(lastActivityLabel)}
            />
            {dirtyLabel && showGitMetadataChip ? (
              <MetadataIconChip icon={FileWarning} label={dirtyLabel} tone="destructive" />
            ) : showGitMetadataChip ? (
              <MetadataIconChip
                icon={GitMerge}
                label={formatGitStatus(candidate)}
                tone={getWorkspaceCleanupGitLabel(candidate) === 'Clean' ? 'ready' : 'review'}
              />
            ) : null}
            {contextDetails ? (
              <MetadataIconChip
                icon={SquareTerminal}
                label={contextDetails}
                value={String(contextCount)}
              />
            ) : null}
            {reviewInfo.label ? (
              <MetadataIconChip
                icon={GitPullRequest}
                label={getReviewTooltip(reviewInfo)}
                value={reviewInfo.label}
                tone={getReviewPillTone(reviewInfo)}
              />
            ) : null}
          </div>

          {failure ? (
            <div className="text-destructive mt-2 flex items-center gap-1.5 text-xs">
              <AlertTriangle className="size-3.5" />
              {failure}
            </div>
          ) : null}

          {hasExpandableDetails ? (
            <CandidateRowDetails
              blockers={blockers}
              branchSafetyDetails={branchSafetyDetails}
              candidate={candidate}
              contextDetails={contextDetails}
              expanded={expanded}
            />
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {hasExpandableDetails ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={
                      expanded
                        ? translate(
                            'auto.components.workspace.cleanup.candidateRow.collapseDetails',
                            'Collapse details'
                          )
                        : translate(
                            'auto.components.workspace.cleanup.candidateRow.expandDetails',
                            'Expand details'
                          )
                    }
                    aria-expanded={expanded}
                    onClick={() => onToggleExpanded(candidate.worktreeId)}
                  >
                    <ChevronDown
                      className={cn('size-3.5 transition-transform', expanded && 'rotate-180')}
                    />
                  </Button>
                }
              />
              <TooltipContent side="top" sideOffset={4}>
                {expanded
                  ? translate(
                      'auto.components.workspace.cleanup.candidateRow.collapseDetails',
                      'Collapse details'
                    )
                  : translate(
                      'auto.components.workspace.cleanup.candidateRow.expandDetails',
                      'Expand details'
                    )}
              </TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={translate(
                    'auto.components.workspace.cleanup.WorkspaceCleanupDialog.1bffc07ba7',
                    'View {{value0}}',
                    { value0: candidate.displayName }
                  )}
                  onClick={() => onView(candidate)}
                >
                  <Search className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent side="top" sideOffset={4}>
              {translate(
                'auto.components.workspace.cleanup.WorkspaceCleanupDialog.ee81adfcef',
                'View'
              )}
            </TooltipContent>
          </Tooltip>
          {!ignored ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={translate(
                      'auto.components.workspace.cleanup.WorkspaceCleanupDialog.a9957007eb',
                      'Ignore {{value0}}',
                      { value0: candidate.displayName }
                    )}
                    onClick={() => onIgnore(candidate)}
                  >
                    <EyeOff className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="top" sideOffset={4}>
                {translate(
                  'auto.components.workspace.cleanup.WorkspaceCleanupDialog.4d0b72481c',
                  'Ignore'
                )}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {selectable ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={translate(
                      'auto.components.workspace.cleanup.WorkspaceCleanupDialog.3828408538',
                      'Remove {{value0}}',
                      { value0: candidate.displayName }
                    )}
                    className="text-destructive hover:text-destructive"
                    onClick={() => onRemove(candidate)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="top" sideOffset={4}>
                {translate(
                  'auto.components.workspace.cleanup.WorkspaceCleanupDialog.9cc26c019d',
                  'Remove'
                )}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function formatCompactActivityLabel(label: string): string {
  if (label === 'Just now') {
    return 'now'
  }
  return label.replace(/ ago$/, '')
}

function getReviewTooltip(reviewInfo: WorkspaceCleanupReviewInfo): string {
  const parts = [reviewInfo.label]
  if (reviewInfo.state) {
    parts.push(reviewInfo.state)
  }
  if (reviewInfo.title) {
    parts.push(reviewInfo.title)
  }
  return parts.filter(Boolean).join(' · ')
}
