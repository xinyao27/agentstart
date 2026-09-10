import type { GitStatusEntry } from '@agentstart/protocol/git/status-types'
import {
  isPositiveHostedReviewNumber,
  type HostedReviewProvider
} from '@agentstart/protocol/hosted-review/types'
import type { Worktree } from '@agentstart/protocol/worktree/model'
import React from 'react'
import { getGitHubPRCacheKey } from '~renderer/github/cache-key'
import {
  localizedHostedReviewCopy,
  resolveSupportedHostedReviewCopyProvider
} from '~renderer/i18n/hosted-review-localized-copy'
import { translate } from '~renderer/i18n/i18n'
import { getHostedReviewCacheKey } from '~renderer/source-control/hosted-review-state/slice'
import { useActiveWorktree, useRepoById } from '~renderer/store/selectors'
import { useAppStore } from '~renderer/store/state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~renderer/ui/tabs'
import ChecksPanel from '~renderer/workspace-panel/checks-panel'
import {
  LOCAL_RIGHT_SIDEBAR_PANEL_SOURCE,
  type RightSidebarPanelSource
} from '~renderer/workspace-panel/right-sidebar-panel-source'
import SourceControl from '~renderer/workspace-panel/source-control'
import { getWorktreeGitIdentityDisplay } from '~renderer/worktree/git-identity-display'

import { DiffLineCounts } from '../entry-details'
import { useAutoOpenAllDiffs } from './auto-open-all-diffs'
import type { SourceControlPanelView } from './state'

type SourceControlWorkspacePanelProps = {
  source?: RightSidebarPanelSource
  isVisible?: boolean
  workspacePanelTabId?: string
  view?: SourceControlPanelView
  onViewChange?: (view: SourceControlPanelView) => void
}

type ReviewTabDetails = {
  provider: HostedReviewProvider
  number: number
}

type ChangeLineCounts = {
  added: number
  removed: number
}

export default function SourceControlWorkspacePanel({
  source = LOCAL_RIGHT_SIDEBAR_PANEL_SOURCE,
  isVisible = true,
  workspacePanelTabId,
  view: controlledView,
  onViewChange
}: SourceControlWorkspacePanelProps): React.JSX.Element {
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const storedView = useAppStore((state) =>
    activeWorktreeId ? state.sourceControlPanelViewByWorktree[activeWorktreeId] : undefined
  )
  const setStoredView = useAppStore((state) => state.setSourceControlPanelView)
  const requestedView = useAppStore((state) => state.requestedSourceControlPanelView)
  const view = controlledView ?? storedView ?? requestedView
  const { changeLineCounts, reviewDetails } = useSourceControlTabDetails()
  useAutoOpenAllDiffs({ isVisible, workspacePanelTabId })
  // Why: Base UI unmounts an inactive panel, so every Changes/Review switch tore
  // down and rebuilt both controller hook chains, their git/review effects and
  // the file trees. Keep a panel alive once visited — `isVisible` already stops
  // the hidden side from polling, so the cost of staying mounted is idle state.
  const [visitedViews, setVisitedViews] = React.useState<ReadonlySet<SourceControlPanelView>>(
    () => new Set([view])
  )
  if (!visitedViews.has(view)) {
    setVisitedViews(new Set(visitedViews).add(view))
  }

  const handleViewChange = (value: string): void => {
    if (value !== 'changes' && value !== 'review') {
      return
    }
    if (onViewChange) {
      onViewChange(value)
      return
    }
    if (activeWorktreeId) {
      setStoredView(activeWorktreeId, value)
    }
  }

  return (
    <Tabs value={view} onValueChange={handleViewChange} className="h-full min-h-0 gap-0">
      <div className="shrink-0 p-2">
        <TabsList
          aria-label={translate(
            'auto.components.workspace.panel.source.control.workspace.panel.views',
            'Changes and review'
          )}
        >
          <TabsTrigger value="changes">
            <span>
              {translate(
                'auto.components.workspace.panel.source.control.workspace.panel.changes',
                'Changes'
              )}
            </span>
            {changeLineCounts ? <DiffLineCounts {...changeLineCounts} /> : null}
          </TabsTrigger>
          <TabsTrigger value="review">
            <span>
              {reviewDetails
                ? formatReviewTabLabel(reviewDetails)
                : translate(
                    'auto.components.workspace.panel.source.control.workspace.panel.review',
                    'Review'
                  )}
            </span>
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent
        value="changes"
        className="min-h-0 overflow-hidden"
        keepMounted={visitedViews.has('changes')}
      >
        <SourceControl
          source={source}
          isVisible={isVisible && view === 'changes'}
          workspacePanelTabId={workspacePanelTabId}
        />
      </TabsContent>
      <TabsContent
        value="review"
        className="min-h-0 overflow-hidden"
        keepMounted={visitedViews.has('review')}
      >
        <ChecksPanel
          source={source}
          isVisible={isVisible && view === 'review'}
          workspacePanelTabId={workspacePanelTabId}
        />
      </TabsContent>
    </Tabs>
  )
}

function useSourceControlTabDetails(): {
  changeLineCounts: ChangeLineCounts | null
  reviewDetails: ReviewTabDetails | null
} {
  const activeWorktree = useActiveWorktree()
  const activeWorktreeId = activeWorktree?.id ?? null
  const entries = useAppStore((state) =>
    activeWorktreeId ? state.gitStatusByWorktree[activeWorktreeId] : undefined
  )
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)
  const settings = useAppStore((state) => state.settings)
  const gitIdentity = activeWorktree ? getWorktreeGitIdentityDisplay(activeWorktree) : null
  const branch = gitIdentity?.kind === 'branch' ? gitIdentity.branchName : ''
  const hostedReviewCacheKey =
    activeRepo && branch
      ? getHostedReviewCacheKey(
          activeRepo.path,
          branch,
          settings,
          activeRepo.id,
          activeRepo.executionHostId,
          true
        )
      : null
  const githubReviewCacheKey =
    activeRepo && branch
      ? getGitHubPRCacheKey(
          activeRepo.path,
          activeRepo.id,
          branch,
          settings,
          activeRepo.executionHostId,
          true
        )
      : null
  const hostedReview = useAppStore((state) =>
    hostedReviewCacheKey ? (state.hostedReviewCache[hostedReviewCacheKey]?.data ?? null) : null
  )
  const githubReview = useAppStore((state) =>
    githubReviewCacheKey ? (state.prCache[githubReviewCacheKey]?.data ?? null) : null
  )

  return {
    changeLineCounts: summarizeChangeLines(entries),
    reviewDetails: resolveLocalReviewDetails(activeWorktree, hostedReview, githubReview)
  }
}

function summarizeChangeLines(
  entries: readonly GitStatusEntry[] | undefined
): ChangeLineCounts | null {
  if (!entries) {
    return null
  }
  let added = 0
  let removed = 0
  for (const entry of entries) {
    added += entry.added ?? 0
    removed += entry.removed ?? 0
  }
  return added > 0 || removed > 0 ? { added, removed } : null
}

function resolveLocalReviewDetails(
  worktree: Worktree | null,
  hostedReview: ReviewTabDetails | null,
  githubReview: { number: number } | null
): ReviewTabDetails | null {
  const linkedReview = resolveLinkedReviewDetails(worktree)
  if (githubReview && isPositiveHostedReviewNumber(githubReview.number)) {
    return { provider: 'github', number: githubReview.number }
  }
  if (hostedReview && isPositiveHostedReviewNumber(hostedReview.number)) {
    return hostedReview
  }
  return linkedReview
}

function resolveLinkedReviewDetails(worktree: Worktree | null): ReviewTabDetails | null {
  if (!worktree) {
    return null
  }
  const number = worktree.linkedPR ?? 0
  return isPositiveHostedReviewNumber(number) ? { provider: 'github', number } : null
}

function formatReviewTabLabel(review: ReviewTabDetails): string {
  const copy = localizedHostedReviewCopy(resolveSupportedHostedReviewCopyProvider(review.provider))
  return translate(
    'auto.components.workspace.panel.source.control.workspace.panel.pullRequestNumber',
    '{{value0}} #{{value1}}',
    { value0: copy.shortLabel, value1: review.number }
  )
}
