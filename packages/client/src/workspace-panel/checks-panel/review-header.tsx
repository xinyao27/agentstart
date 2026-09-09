import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  DotsThree as Ellipsis,
  Link,
  LinkBreak as Unlink,
  ArrowClockwise as RefreshCw
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '~renderer/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME } from '../right-sidebar-button-styles'
import { PullRequestIcon, prStateColor } from './content'
import type { ChecksPanelReview } from './review'

type ChecksPanelReviewHeaderProps = {
  review: ChecksPanelReview
  isRefreshing: boolean
  canUnlinkPullRequest: boolean
  onRefresh: () => void
  onOpenReview: (event: React.MouseEvent<HTMLAnchorElement>) => void
  onUnlinkPullRequest: () => void
  onLinkAnotherPullRequest: () => void
}

export function ChecksPanelReviewHeader({
  review,
  isRefreshing,
  canUnlinkPullRequest,
  onRefresh,
  onOpenReview,
  onUnlinkPullRequest,
  onLinkAnotherPullRequest
}: ChecksPanelReviewHeaderProps): React.JSX.Element {
  const reviewNumberLabel = `#${review.number}`
  const ReviewIcon = PullRequestIcon
  const reviewHostLabel = 'GitHub'
  const showPullRequestMenu = true
  const openTitle = translate(
    'auto.components.right.sidebar.ChecksPanel.5c88c6db07',
    'Open on {{value0}}',
    { value0: reviewHostLabel }
  )

  return (
    <div className="flex min-w-0 items-center gap-1 text-xs leading-none">
      <ReviewIcon className="text-muted-foreground size-3 shrink-0" />
      <a
        href={review.url}
        className="decoration-border text-foreground hover:decoration-foreground focus-visible:bg-accent shrink-0 font-medium underline underline-offset-2 opacity-80 outline-none"
        title={openTitle}
        onClick={(event) => {
          event.preventDefault()
          onOpenReview(event)
        }}
      >
        {reviewNumberLabel}
      </a>
      <span
        className={cn(
          'border px-1.5 py-0.5 text-[9px] font-semibold tracking-wider uppercase',
          prStateColor(review.state)
        )}
      >
        {review.state}
      </span>
      <div className="flex-1" />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon-toolbar"
              className={RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME}
              aria-label={translate(
                'auto.components.right.sidebar.ChecksPanel.7f4489f370',
                'Refresh'
              )}
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <LoadingIndicator className="size-3.5" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
            </Button>
          }
        />
        <TooltipContent side="bottom" sideOffset={4}>
          {translate('auto.components.right.sidebar.ChecksPanel.7f4489f370', 'Refresh')}
        </TooltipContent>
      </Tooltip>
      {showPullRequestMenu && (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex shrink-0">
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-toolbar"
                        aria-label={translate(
                          'auto.components.right.sidebar.ChecksPanel.653c105ecc',
                          'More PR actions'
                        )}
                        className={RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME}
                      >
                        <Ellipsis className="size-3.5" />
                      </Button>
                    }
                  />
                </span>
              }
            />
            <TooltipContent side="bottom" sideOffset={6}>
              {translate('auto.components.right.sidebar.ChecksPanel.653c105ecc', 'More PR actions')}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem disabled={!canUnlinkPullRequest} onClick={onUnlinkPullRequest}>
              <Unlink className="size-3.5" />
              {translate('auto.components.right.sidebar.ChecksPanel.7202f4a40a', 'unlink PR')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onLinkAnotherPullRequest}>
              <Link className="size-3.5" />
              {translate('auto.components.right.sidebar.ChecksPanel.07871c0589', 'Link another PR')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
