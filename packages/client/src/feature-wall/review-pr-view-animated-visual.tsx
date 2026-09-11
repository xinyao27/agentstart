import type { ComponentType, JSX, ReactNode } from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  Files,
  GitMerge,
  Chat as MessageSquare,
  MagnifyingGlass as Search
} from '~renderer/icons/hugeicons'
import { useShortcutLabel } from '~renderer/keyboard-input/use-shortcut-label'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import { ReviewPRViewVisualStyles } from './review-animated-visual-pr-view-styles'
import { CheckTinyIcon, ChevDownIcon } from './review-animated-visual-shared'
import {
  COMPLETE_REVIEW_PR_PHASE,
  useReviewPrStoryboard,
  type ReviewPrPhase
} from './review-pr-view-storyboard'

type SidebarTabId = 'explorer' | 'search' | 'source-control'

const SIDEBAR_TABS: readonly {
  id: SidebarTabId
  icon: ComponentType<{ className?: string; size?: number }>
  label: string
}[] = [
  {
    id: 'explorer',
    icon: Files,
    get label() {
      return translate(
        'auto.components.feature.wall.ReviewPRViewAnimatedVisual.6e3f5223c5',
        'Explorer'
      )
    }
  },
  {
    id: 'search',
    icon: Search,
    get label() {
      return translate(
        'auto.components.feature.wall.ReviewPRViewAnimatedVisual.8e715588e4',
        'Search'
      )
    }
  },
  {
    id: 'source-control',
    icon: GitMerge,
    get label() {
      return translate('auto.components.workspace.panel.sourceControl.title', 'Changes & Review')
    }
  }
]

function SidebarTabs(props: {
  active: SidebarTabId
  interactiveReview?: boolean
  reviewHovered?: boolean
}): JSX.Element {
  const sourceControlShortcutLabel = useShortcutLabel('sidebar.sourceControl.toggle')
  const reviewTooltip =
    sourceControlShortcutLabel === 'Unassigned'
      ? translate('auto.components.workspace.panel.sourceControl.title', 'Changes & Review')
      : `${translate(
          'auto.components.workspace.panel.sourceControl.title',
          'Changes & Review'
        )} (${sourceControlShortcutLabel})`

  return (
    <div className="ravpr-tabs">
      {SIDEBAR_TABS.map((tab) => {
        const Icon = tab.icon
        const isActive = tab.id === props.active
        return (
          <span
            key={tab.id}
            className={cn(
              'ravpr-tab',
              isActive && 'is-active',
              props.reviewHovered && tab.id === 'source-control' && 'is-hovered'
            )}
            aria-label={tab.label}
          >
            <Icon size={16} aria-hidden />
          </span>
        )
      })}
      {props.interactiveReview ? (
        <span className={cn('ravpr-tooltip', props.reviewHovered && 'is-visible')}>
          {reviewTooltip}
        </span>
      ) : null}
    </div>
  )
}

function StatusCell(): JSX.Element {
  return (
    <span>
      <LoadingIndicator className="ravpr-ring size-3.5 text-[color:var(--warning)]" />
      <span className="ravpr-check">
        <CheckTinyIcon />
      </span>
    </span>
  )
}

function ExplorerSkeletonRow(props: { active?: boolean; width: number }): JSX.Element {
  return (
    <div className={cn('ravpr-file', props.active && 'is-active')}>
      <span className="ravpr-file-icon" />
      <span className="ravpr-file-name" style={{ width: props.width }} />
      <span className="ravpr-file-status" />
    </div>
  )
}

function CommentCard(props: { path: string; children: ReactNode; visible: boolean }): JSX.Element {
  return (
    <div className={cn('ravpr-comment-card', props.visible && 'is-visible')}>
      <div className="ravpr-comment-head">
        <span className="ravpr-avatar" />
        <span className="ravpr-author" />
        <span className="ravpr-comment-path">{props.path}</span>
      </div>
      <div className="ravpr-comment-body">{props.children}</div>
    </div>
  )
}

function ReviewPrViewFrame(props: { phase: ReviewPrPhase }): JSX.Element {
  const { phase } = props
  const isReviewOpen = phase !== 'explorer' && phase !== 'review-hover'
  const areChecksVisible = phase !== 'explorer' && phase !== 'review-hover' && phase !== 'review'
  const isVerified = phase === 'verified' || phase === 'first-comment' || phase === 'complete'
  const areCommentsVisible = phase === 'first-comment' || phase === 'complete'
  const commentCount = phase === 'complete' ? 2 : phase === 'first-comment' ? 1 : 0

  return (
    <div className="ravpr-stage">
      <div className="ravpr-stack">
        <div className={cn('ravpr-sidebar is-visible', isReviewOpen && 'is-hiding')}>
          <SidebarTabs
            active="explorer"
            interactiveReview
            reviewHovered={phase === 'review-hover'}
          />
          <div className="ravpr-explorer">
            <div className="ravpr-heading">
              {translate(
                'auto.components.feature.wall.ReviewPRViewAnimatedVisual.6e3f5223c5',
                'Explorer'
              )}
            </div>
            <div className="ravpr-file-list">
              <ExplorerSkeletonRow active width={190} />
              <ExplorerSkeletonRow width={158} />
              <ExplorerSkeletonRow width={176} />
              <ExplorerSkeletonRow width={132} />
            </div>
          </div>
        </div>

        <div className={cn('ravpr-card', isReviewOpen && 'is-visible')}>
          <SidebarTabs active="source-control" />
          <div className="border-border shrink-0 border-y p-1.5">
            <div className="bg-muted flex h-7 p-0.5 text-xs font-medium">
              <span className="text-muted-foreground flex flex-1 items-center justify-center">
                {translate(
                  'auto.components.workspace.panel.source.control.workspace.panel.changes',
                  'Changes'
                )}
              </span>
              <span className="bg-background text-foreground flex flex-1 items-center justify-center">
                {translate(
                  'auto.components.workspace.panel.source.control.workspace.panel.review',
                  'Review'
                )}
              </span>
            </div>
          </div>
          <div className="ravpr-body">
            <div className="ravpr-number-row">
              <span className="ravpr-number">#2351</span>
              <span className="ravpr-open">
                {translate(
                  'auto.components.feature.wall.ReviewPRViewAnimatedVisual.dfe313e0c9',
                  'OPEN'
                )}
              </span>
            </div>
            <div className="ravpr-title">
              {translate(
                'auto.components.feature.wall.ReviewPRViewAnimatedVisual.0aab7ab84a',
                'Add local diagnostics error tracking'
              )}
            </div>
            <Button
              variant="ghost"
              size="xs"
              className="ravpr-merge focus-visible:bg-accent h-auto border-0 p-0"
              type="button"
            >
              <GitMerge className="size-3" />
              {translate(
                'auto.components.feature.wall.ReviewPRViewAnimatedVisual.2f37142229',
                'Squash and merge'
              )}
              <ChevDownIcon />
            </Button>

            <div className={cn('ravpr-reveal', areChecksVisible && 'is-visible')}>
              <div className={cn('ravpr-section-row', isVerified && 'is-done')}>
                <StatusCell />
                <span className="ravpr-label">
                  {translate(
                    isVerified
                      ? 'auto.components.feature.wall.ReviewPRViewAnimatedVisual.ca36f7b27c'
                      : 'auto.components.feature.wall.ReviewPRViewAnimatedVisual.9a097cae12',
                    isVerified ? 'Passed' : '1 pending'
                  )}
                </span>
                <span className="ravpr-meta">
                  {translate(
                    'auto.components.feature.wall.ReviewPRViewAnimatedVisual.d340c052fb',
                    'verify'
                  )}
                </span>
              </div>
              <div className="ravpr-check-list">
                <div className={cn('ravpr-check-row', isVerified && 'is-done')}>
                  <StatusCell />
                  <span>
                    {translate(
                      'auto.components.feature.wall.ReviewPRViewAnimatedVisual.d340c052fb',
                      'verify'
                    )}
                  </span>
                  <span className="ravpr-check-state">
                    {translate(
                      isVerified
                        ? 'auto.components.feature.wall.ReviewPRViewAnimatedVisual.ca36f7b27c'
                        : 'auto.components.feature.wall.ReviewPRViewAnimatedVisual.8ed213397c',
                      isVerified ? 'Passed' : 'Running'
                    )}
                  </span>
                </div>
                <div className="ravpr-check-row is-done">
                  <StatusCell />
                  <span>
                    {translate(
                      'auto.components.feature.wall.ReviewPRViewAnimatedVisual.2ef0b97954',
                      'typecheck'
                    )}
                  </span>
                  <span className="ravpr-check-state">
                    {translate(
                      'auto.components.feature.wall.ReviewPRViewAnimatedVisual.ca36f7b27c',
                      'Passed'
                    )}
                  </span>
                </div>
                <div className="ravpr-check-row is-done">
                  <StatusCell />
                  <span>
                    {translate(
                      'auto.components.feature.wall.ReviewPRViewAnimatedVisual.25f6838e43',
                      'lint'
                    )}
                  </span>
                  <span className="ravpr-check-state">
                    {translate(
                      'auto.components.feature.wall.ReviewPRViewAnimatedVisual.ca36f7b27c',
                      'Passed'
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div className={cn('ravpr-reveal', areCommentsVisible && 'is-visible')}>
              <div className="ravpr-section-row">
                <MessageSquare className="size-3.5" />
                <span className="ravpr-label">
                  {translate(
                    'auto.components.feature.wall.ReviewPRViewAnimatedVisual.7a8b896e11',
                    'Comments'
                  )}
                </span>
                <span className="ravpr-meta">
                  <span>{commentCount}</span>{' '}
                  {translate(
                    'auto.components.feature.wall.ReviewPRViewAnimatedVisual.fb1a856b6d',
                    'open'
                  )}
                </span>
              </div>
              <div className="ravpr-comment-list">
                <CommentCard visible={commentCount >= 1} path="src/main/diagnostics/diagnostics.ts">
                  {translate(
                    'auto.components.feature.wall.ReviewPRViewAnimatedVisual.71828fba75',
                    'Can we include the failing command in the diagnostic payload?'
                  )}
                </CommentCard>
                <CommentCard
                  visible={commentCount >= 2}
                  path="src/main/diagnostics/main-thread-churn-probe.ts"
                >
                  {translate(
                    'auto.components.feature.wall.ReviewPRViewAnimatedVisual.6f4c2d7cb7',
                    'Add a coverage case for'
                  )}
                  <code>
                    {translate(
                      'auto.components.feature.wall.ReviewPRViewAnimatedVisual.c2062da7ec',
                      'stderr'
                    )}
                  </code>{' '}
                  {translate(
                    'auto.components.feature.wall.ReviewPRViewAnimatedVisual.7c2808ecff',
                    'truncation before merge.'
                  )}
                </CommentCard>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ReviewPRViewVisualStyles />
    </div>
  )
}

function AnimatedReviewPrView(): JSX.Element {
  const phase = useReviewPrStoryboard()
  return <ReviewPrViewFrame phase={phase} />
}

// Why: the Review PR visual mirrors the real combined panel: the workspace
// opens Changes & Review before selecting its Review view.
export function ReviewPRViewAnimatedVisual(props: { reducedMotion: boolean }): JSX.Element {
  return props.reducedMotion ? (
    <ReviewPrViewFrame phase={COMPLETE_REVIEW_PR_PHASE} />
  ) : (
    <AnimatedReviewPrView />
  )
}
