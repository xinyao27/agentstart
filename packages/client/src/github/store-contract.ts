import type {
  GitHubPRRefreshAlias,
  GitHubPRRefreshEvent,
  GitHubPRRefreshReason,
  PRInfo
} from '@yiru/protocol/hosted-review/pull-request-types'
import type {
  GitHubCommentResult,
  GitHubOwnerRepo,
  GitHubWorkItem,
  PRCheckDetail,
  PRCheckRunDetails,
  PRComment
} from '@yiru/protocol/hosted-review/review-types'
import type { ProjectSourceContext } from '@yiru/protocol/project/source-context'

export type CacheEntry<T> = {
  data: T | null
  fetchedAt: number
  headSha?: string
}

export type GitHubFetchOptions = {
  force?: boolean
  noCache?: boolean
  sourceContext?: ProjectSourceContext | null
}

export type GitHubRepoFetchOptions = GitHubFetchOptions & {
  repoId?: string
  executionHostId?: string
}

export type GitHubPRFallbackSource = NonNullable<GitHubPRRefreshAlias['fallbackPRSource']>

export type PRRefreshState = {
  status: 'queued' | 'in-flight' | 'paused' | 'skipped' | 'error'
  reason: GitHubPRRefreshReason
  updatedAt: number
  pausedUntil?: number
  message?: string
}

export type PRRefreshStateClearToken = {
  sequence: number
  status: PRRefreshState['status']
  updatedAt: number
}

export type GitHubSlice = {
  prCache: Record<string, CacheEntry<PRInfo>>
  checksCache: Record<string, CacheEntry<PRCheckDetail[]>>
  commentsCache: Record<string, CacheEntry<PRComment[]>>
  prRefreshSequences: Record<string, number>
  prRefreshStates: Record<string, PRRefreshState>
  prVisibleRefreshGeneration: number
  workItemsCache: Record<string, CacheEntry<GitHubWorkItem[]>>
  fetchPRForBranch: (
    repoPath: string,
    branch: string,
    options?: GitHubRepoFetchOptions & {
      worktreeId?: string
      linkedPRNumber?: number | null
      fallbackPRNumber?: number | null
      fallbackPRSource?: GitHubPRFallbackSource | null
    }
  ) => Promise<PRInfo | null>
  fetchPRChecks: (
    repoPath: string,
    prNumber: number,
    branch?: string,
    headSha?: string,
    prRepo?: GitHubOwnerRepo | null,
    options?: GitHubRepoFetchOptions
  ) => Promise<PRCheckDetail[]>
  fetchPRCheckDetails: (
    repoPath: string,
    args: {
      checkRunId?: number
      workflowRunId?: number
      checkName?: string
      url?: string | null
      prRepo?: GitHubOwnerRepo | null
    },
    options?: GitHubRepoFetchOptions
  ) => Promise<PRCheckRunDetails | null>
  fetchPRComments: (
    repoPath: string,
    prNumber: number,
    options?: GitHubRepoFetchOptions & { prRepo?: GitHubOwnerRepo | null }
  ) => Promise<PRComment[]>
  addPRConversationComment: (
    repoPath: string,
    prNumber: number,
    body: string,
    options?: GitHubRepoFetchOptions & { prRepo?: GitHubOwnerRepo | null }
  ) => Promise<GitHubCommentResult>
  addPRReviewCommentReply: (
    repoPath: string,
    prNumber: number,
    commentId: number,
    body: string,
    options?: GitHubRepoFetchOptions & {
      prRepo?: GitHubOwnerRepo | null
      threadId?: string
      path?: string
      line?: number
    }
  ) => Promise<GitHubCommentResult>
  resolveReviewThread: (
    repoPath: string,
    prNumber: number,
    threadId: string,
    resolve: boolean,
    options?: GitHubRepoFetchOptions & { prRepo?: GitHubOwnerRepo | null }
  ) => Promise<boolean>
  initGitHubCache: () => Promise<void>
  refreshAllGitHub: () => void
  refreshGitHubForWorktree: (worktreeId: string, executionHostId?: string) => void
  refreshGitHubForWorktreeIfStale: (worktreeId: string) => void
  enqueueGitHubPRRefresh: (
    worktreeId: string,
    reason: GitHubPRRefreshReason,
    priority?: number
  ) => void
  reportVisibleGitHubPRRefreshCandidates: (worktreeIds: string[], generation: number) => void
  bumpGitHubPRVisibleRefreshGeneration: () => void
  applyGitHubPRRefreshEvent: (event: GitHubPRRefreshEvent) => void
  getEffectiveGitHubPRRefreshState: (cacheKey: string, now?: number) => PRRefreshState | undefined
  expireGitHubPRRefreshState: (
    cacheKey: string,
    token: PRRefreshStateClearToken,
    now?: number
  ) => void
  getCachedWorkItems: (
    repoId: string,
    limit: number,
    query: string,
    repoPath?: string,
    sourceContext?: ProjectSourceContext | null
  ) => GitHubWorkItem[] | null
  fetchWorkItems: (
    repoId: string,
    repoPath: string,
    limit: number,
    query: string,
    options?: GitHubFetchOptions
  ) => Promise<GitHubWorkItem[]>
  fetchWorkItemsAcrossRepos: (
    repos: {
      repoId: string
      path: string
      executionHostId?: string | null
      sourceContext?: ProjectSourceContext | null
    }[],
    perRepoLimit: number,
    displayLimit: number,
    query: string,
    options?: GitHubFetchOptions
  ) => Promise<{ items: GitHubWorkItem[]; failedCount: number }>
  prefetchWorkItems: (
    repoId: string,
    repoPath: string,
    limit?: number,
    query?: string,
    options?: { sourceContext?: ProjectSourceContext | null }
  ) => void
  evictGitHubRepoCaches: (repoId: string, repoPath?: string) => void
}
