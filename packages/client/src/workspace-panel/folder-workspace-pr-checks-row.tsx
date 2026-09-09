import type { PRCheckDetail, PRCheckRunDetails } from '@yiru/protocol/hosted-review/review-types'
import { openHttpLink } from '~renderer/editor/http-link-routing'
import { translate } from '~renderer/i18n/i18n'
import {
  CaretRight as ChevronRight,
  ArrowSquareOut as ExternalLink
} from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import {
  CHECK_COLOR,
  CHECK_ICON,
  ChecksList,
  prStateColor,
  PullRequestIcon
} from './checks-panel/content'
import type { ParentPrChecksRow } from './parent-pr-checks-rows'

type FolderWorkspacePrChecksRowProps = {
  row: ParentPrChecksRow
  expanded: boolean
  onToggle: () => void
  onLoadCheckDetails: (check: PRCheckDetail) => Promise<PRCheckRunDetails | null>
}

export function FolderWorkspacePrChecksRow({
  row,
  expanded,
  onToggle,
  onLoadCheckDetails
}: FolderWorkspacePrChecksRowProps): React.JSX.Element {
  const ReviewIcon = PullRequestIcon
  const StatusIcon = CHECK_ICON[row.checkTone] ?? CHECK_ICON.neutral
  // Why: match the regular PR checks header; the review identity leads,
  // while aggregate check state stays with the summary metadata.
  const showStatusIcon = row.checkTone !== 'neutral'
  const reviewProviderLabel = 'PR'
  const toggleDetailsLabel = expanded
    ? translate(
        'auto.components.rightSidebar.FolderWorkspacePrChecksPanel.hideDetails',
        'Hide {{value0}} PR check details',
        { value0: row.worktree.displayName }
      )
    : translate(
        'auto.components.rightSidebar.FolderWorkspacePrChecksPanel.showDetails',
        'Show {{value0}} PR check details',
        { value0: row.worktree.displayName }
      )
  const openReviewLabel = translate(
    'auto.components.rightSidebar.FolderWorkspacePrChecksPanel.openReview',
    'Open {{value0}} link',
    { value0: reviewProviderLabel }
  )
  return (
    <div
      className={cn(
        'group border border-transparent',
        expanded ? 'border-border bg-card' : 'hover:bg-accent'
      )}
    >
      <div
        role="button"
        tabIndex={0}
        className="flex w-full min-w-0 items-start gap-2 px-2 py-2 text-left focus-visible:outline-none"
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') {
            return
          }
          event.preventDefault()
          onToggle()
        }}
        aria-expanded={expanded}
        aria-label={toggleDetailsLabel}
      >
        <ChevronRight
          className={cn(
            'mt-0.5 size-3 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-90'
          )}
        />
        <ReviewIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <PrChecksRowHeader row={row} />
          <div className="text-foreground/90 mt-1 truncate text-[12px]">{row.title}</div>
          <div className="text-muted-foreground mt-1 flex min-w-0 items-center gap-1.5 text-[11px]">
            {showStatusIcon ? (
              <StatusIcon className={cn('size-3 shrink-0', CHECK_COLOR[row.checkTone])} />
            ) : null}
            <span className="truncate">{row.summary}</span>
            {row.repo ? <span className="shrink-0">· {row.repo.displayName}</span> : null}
            {row.branch ? <span className="truncate">· {row.branch}</span> : null}
          </div>
          {row.detailNames.length > 0 ? (
            <div className="text-muted-foreground mt-1 truncate text-[11px]">
              {row.detailNames.join(', ')}
            </div>
          ) : null}
        </div>
        {row.reviewUrl ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="quiet"
                  size="xs"
                  type="button"
                  className="h-auto border-0 p-1 opacity-80 group-hover:opacity-100"
                  aria-label={openReviewLabel}
                  onClick={(event) => {
                    event.stopPropagation()
                    openHttpLink(row.reviewUrl!, { event, worktreeId: row.worktree.id })
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <ExternalLink className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent side="left">{openReviewLabel}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {expanded ? (
        <div className="border-border border-t">
          <ChecksList
            checks={row.checks}
            checksLoading={row.isRefreshing}
            checkDetailsContextKey={row.refreshIdentity}
            onLoadCheckDetails={onLoadCheckDetails}
            worktreeId={row.worktree.id}
            detailsStickySurface="card"
          />
        </div>
      ) : null}
    </div>
  )
}

function PrChecksRowHeader({ row }: { row: ParentPrChecksRow }): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="text-foreground truncate text-[13px] font-medium">
        {row.worktree.displayName}
      </span>
      {row.reviewLabel ? (
        <span className="border-border text-muted-foreground inline-flex shrink-0 items-center border px-1.5 py-0.5 text-[10px] font-medium">
          {row.reviewLabel}
        </span>
      ) : null}
      {row.reviewState ? (
        <span
          className={cn(
            'shrink-0 border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
            prStateColor(row.reviewState)
          )}
        >
          {row.reviewState}
        </span>
      ) : null}
    </div>
  )
}
