import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  Copy,
  DotsThree as Ellipsis,
  LinkBreak as Unlink,
  ArrowSquareOut as ExternalLink,
  MonitorArrowUp as MonitorUp
} from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '~renderer/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { getProviderName, getReviewLabel, ReviewIcon } from '../worktree-review-presentation'
import { WorktreeCardDetailSection, WorktreeCardDetailSectionContent } from './detail-section'
import { DetailHeader, MetadataActionIcon } from './metadata-controls'
import { ReviewChecksBadge, ReviewStateBadge } from './metadata-status-badges'
import type { WorktreeCardPrDisplay } from './pr-display'

type WorktreeCardReviewDetailSectionProps = {
  review: WorktreeCardPrDisplay | null
  reviewMenuOpen: boolean
  onReviewMenuOpenChange: (open: boolean) => void
  onOpenReviewInYiru?: (event: React.MouseEvent) => void
  onCopyReviewLink?: () => void
  onUnlinkReview?: () => void
  closeHover: () => void
}

export function WorktreeCardReviewDetailSection({
  review,
  reviewMenuOpen,
  onReviewMenuOpenChange,
  onOpenReviewInYiru,
  onCopyReviewLink,
  onUnlinkReview,
  closeHover
}: WorktreeCardReviewDetailSectionProps): React.JSX.Element | null {
  if (!review) {
    return null
  }

  const reviewLabel = getReviewLabel()
  const reviewProvider = getProviderName()
  const moreActionsLabel = translate(
    'auto.components.sidebar.WorktreeCardMeta.dbe2d18972',
    'More {{value0}} actions',
    { value0: reviewLabel }
  )
  const moreActionsTrigger = (
    <DropdownMenuTrigger
      render={
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-6"
          aria-label={moreActionsLabel}
          onClick={(event) => event.stopPropagation()}
        >
          <Ellipsis className="size-3" />
        </Button>
      }
    />
  )
  const dismissAndOpenReview = (event: React.MouseEvent): void => {
    closeHover()
    onOpenReviewInYiru?.(event)
  }

  return (
    <WorktreeCardDetailSection>
      <DetailHeader
        icon={<ReviewIcon review={review} className="size-3" />}
        label={translate(
          'auto.components.sidebar.WorktreeCardReviewDetailSection.reviewHeader',
          '{{value0}} #{{value1}}',
          { value0: reviewLabel, value1: review.number }
        )}
        actions={
          <>
            {(onCopyReviewLink || onUnlinkReview) && (
              <DropdownMenu
                modal={false}
                open={reviewMenuOpen}
                onOpenChange={onReviewMenuOpenChange}
              >
                {reviewMenuOpen ? (
                  moreActionsTrigger
                ) : (
                  <Tooltip>
                    <TooltipTrigger render={moreActionsTrigger} />
                    <TooltipContent side="top" sideOffset={4}>
                      {moreActionsLabel}
                    </TooltipContent>
                  </Tooltip>
                )}
                <DropdownMenuContent align="end" className="w-40">
                  {onCopyReviewLink && (
                    <DropdownMenuItem
                      onClick={() => {
                        closeHover()
                        onCopyReviewLink()
                      }}
                    >
                      <Copy className="size-3.5" />
                      {translate(
                        'auto.components.sidebar.WorktreeCardReviewDetailSection.copyLink',
                        'Copy link'
                      )}
                    </DropdownMenuItem>
                  )}
                  {onUnlinkReview && (
                    <DropdownMenuItem
                      onClick={() => {
                        closeHover()
                        onUnlinkReview()
                      }}
                    >
                      <Unlink className="size-3.5" />
                      {translate(
                        'auto.components.sidebar.WorktreeCardMeta.ae76907ca6',
                        'Unlink {{value0}}',
                        { value0: reviewLabel }
                      )}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {review.url && onOpenReviewInYiru && (
              <MetadataActionIcon
                label={translate(
                  'auto.components.sidebar.WorktreeCardMeta.2c67730e07',
                  'Open in Yiru'
                )}
                onClick={dismissAndOpenReview}
              >
                <MonitorUp className="size-3" />
              </MetadataActionIcon>
            )}
            {review.url && (
              <MetadataActionIcon
                label={translate(
                  'auto.components.sidebar.WorktreeCardMeta.ad25c3ff05',
                  'View on {{value0}}',
                  { value0: reviewProvider }
                )}
                href={review.url}
              >
                <ExternalLink className="size-3" />
              </MetadataActionIcon>
            )}
          </>
        }
      />
      <WorktreeCardDetailSectionContent className="space-y-1.5">
        <div className="text-foreground text-[13px] leading-snug font-semibold break-words">
          {review.title}
        </div>
        {(review.state || (review.status && review.status !== 'neutral')) && (
          <div className="flex flex-wrap gap-1">
            <ReviewStateBadge state={review.state} />
            <ReviewChecksBadge status={review.status} />
          </div>
        )}
      </WorktreeCardDetailSectionContent>
    </WorktreeCardDetailSection>
  )
}
