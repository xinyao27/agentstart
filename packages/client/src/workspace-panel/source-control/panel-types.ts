import type { GitConflictOperation } from '@yiru/protocol/git/status-types'
import type { GitPushTarget } from '@yiru/protocol/git/worktree-source'
import type {
  HostedReviewCreationEligibility,
  HostedReviewProvider
} from '@yiru/protocol/hosted-review/types'
import type { RuntimeGitContext } from '~renderer/runtime/git-client'

export type AbortConflictOperation = Extract<GitConflictOperation, 'merge' | 'rebase'>

export type SourceControlOperationTarget = RuntimeGitContext & {
  worktreeId: string
  pushTarget?: GitPushTarget
}

export type HostedReviewCreatedContext = {
  repoPath: string
  repoId: string
  branch: string
  worktreeId: string | null
  openChecks: boolean
}

export type CreatePrIntentNotice = {
  message: string
  tone: 'muted' | 'destructive'
  action?: 'settings'
}

export type HostedReviewCreationState = {
  repoId: string
  worktreeId: string
  branch: string
  data: HostedReviewCreationEligibility
}

export type HostedReviewCreationRequestState = {
  repoId: string
  worktreeId: string
  branch: string
  status: 'loading' | 'failed'
}

export type HostedReviewCreationProviderHint = {
  repoId: string | null
  worktreeId: string | null
  branch: string
  provider: HostedReviewProvider
}

export type CreatedHostedReview = {
  provider: HostedReviewProvider
  number: number
  url: string
}
