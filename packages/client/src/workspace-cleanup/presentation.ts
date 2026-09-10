import type { WorkspaceCleanupCandidate } from '@agentstart/protocol'
import type {
  HostedReviewInfo,
  HostedReviewProvider
} from '@agentstart/protocol/hosted-review/types'
import type { Repo } from '@agentstart/protocol/project/repository'
import type { Worktree } from '@agentstart/protocol/worktree/model'
import { translate } from '~renderer/i18n/i18n'
import { getHostedReviewCacheKey } from '~renderer/source-control/hosted-review-state/slice'
import { getWorktreeMapFromState } from '~renderer/store/selectors'
import type { AppState } from '~renderer/store/types'

export type WorkspaceCleanupSortKey = 'activity' | 'name' | 'repo' | 'review' | 'git'
export type WorkspaceCleanupSortDirection = 'asc' | 'desc'
export type WorkspaceCleanupTimeFilter = 'all' | '30d' | '90d' | 'archived'
export type WorkspaceCleanupReviewFilter =
  | 'all'
  | 'no-review'
  | 'has-review'
  | 'open-review'
  | 'closed-review'
export type WorkspaceCleanupGitFilter = 'all' | 'clean' | 'dirty' | 'unpushed' | 'unknown'
export type WorkspaceCleanupContextFilter = 'all' | 'has-context' | 'no-context'

export type WorkspaceCleanupFilters = {
  query: string
  time: WorkspaceCleanupTimeFilter
  review: WorkspaceCleanupReviewFilter
  git: WorkspaceCleanupGitFilter
  context: WorkspaceCleanupContextFilter
}

export type WorkspaceCleanupReviewInfo = {
  hasReview: boolean
  label: string | null
  state: 'open' | 'closed' | 'merged' | 'draft' | 'unknown' | null
  provider: HostedReviewProvider | null
  title: string | null
}

export type WorkspaceCleanupRendererStateInputs = Pick<
  AppState,
  'worktreesByRepo' | 'hostedReviewCache' | 'repos' | 'settings'
>

export {
  filterWorkspaceCleanupCandidates,
  getWorkspaceCleanupGitLabel,
  hasWorkspaceCleanupLocalContext,
  sortWorkspaceCleanupCandidates
} from './filter-sort'

export function getWorkspaceCleanupReviewInfo(
  candidate: WorkspaceCleanupCandidate,
  state: WorkspaceCleanupRendererStateInputs
): WorkspaceCleanupReviewInfo {
  const worktree = getWorktreeMapFromState(state).get(candidate.worktreeId) ?? null
  const repo = state.repos.find((entry) => entry.id === candidate.repoId) ?? null
  const hostedReview = getCachedHostedReview(candidate, worktree, repo, state)
  if (hostedReview) {
    return {
      hasReview: true,
      label: `${getReviewShortLabel(hostedReview.provider)} #${hostedReview.number}`,
      state: hostedReview.state,
      provider: hostedReview.provider,
      title: hostedReview.title
    }
  }

  const linkedReview = getLinkedReviewFallback(worktree)
  if (linkedReview) {
    return {
      hasReview: true,
      label: linkedReview.label,
      state: 'unknown',
      provider: linkedReview.provider,
      title: null
    }
  }

  return {
    hasReview: false,
    label: null,
    state: null,
    provider: null,
    title: null
  }
}

function getCachedHostedReview(
  candidate: WorkspaceCleanupCandidate,
  worktree: Worktree | null,
  repo: Repo | null,
  state: WorkspaceCleanupRendererStateInputs
): HostedReviewInfo | null {
  if (!repo) {
    return null
  }
  const cacheKey = getHostedReviewCacheKey(
    repo.path,
    getBranchDisplayName(worktree?.branch ?? candidate.branch),
    state.settings,
    repo.id
  )
  return state.hostedReviewCache[cacheKey]?.data ?? null
}

function getLinkedReviewFallback(worktree: Worktree | null): {
  label: string
  provider: HostedReviewProvider
} | null {
  if (!worktree) {
    return null
  }
  if (worktree.linkedPR != null) {
    return {
      label: translate(
        'components.workspace.cleanup.presentation.githubPullRequestNumber',
        'PR #{{value0}}',
        { value0: worktree.linkedPR }
      ),
      provider: 'github'
    }
  }
  return null
}

function getReviewShortLabel(_provider: HostedReviewProvider): string {
  return 'PR'
}

function getBranchDisplayName(branch: string): string {
  return branch.replace(/^refs\/heads\//, '') || 'HEAD'
}
