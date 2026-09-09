import type { PRCheckDetail, PRCheckRunDetails } from '@yiru/protocol/hosted-review/review-types'
import type { HostedReviewInfo } from '@yiru/protocol/hosted-review/types'
import type { Repo } from '@yiru/protocol/project/repository'
import { getGitHubPRCacheKey } from '~renderer/github/cache-key'
import { translate } from '~renderer/i18n/i18n'
import { readProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import {
  buildFixBrokenChecksPrompt,
  getBrokenChecks,
  getCheckDetailsPromptKey
} from '~renderer/source-control/checks-fix-prompt'
import { getHostedReviewCacheKey } from '~renderer/source-control/hosted-review-state/cache-identity'
import { useAppStore } from '~renderer/store/state'
import { getWorktreeGitIdentityDisplay } from '~renderer/worktree/git-identity-display'
import { findWorktreeById } from '~renderer/worktree/state/types'

import { gitHubPRToChecksPanelReview } from '../workspace-panel/checks-panel/review'

export function resolveCheckRunDetailsFixCheck(
  check: PRCheckDetail,
  details: PRCheckRunDetails | null
): PRCheckDetail {
  if (!details) {
    return check
  }
  return {
    ...check,
    status: (details.status as PRCheckDetail['status'] | undefined) ?? check.status,
    conclusion: (details.conclusion as PRCheckDetail['conclusion'] | undefined) ?? check.conclusion
  }
}

export function isCheckRunDetailsFixCandidate(
  check: PRCheckDetail,
  details: PRCheckRunDetails | null = null
): boolean {
  return getBrokenChecks([resolveCheckRunDetailsFixCheck(check, details)]).length > 0
}

export function resolveHostedReviewForCheckRunDetailsFix(
  worktreeId: string
): HostedReviewInfo | null {
  const store = useAppStore.getState()
  const projectRuntimeState = readProjectCatalogRuntimeState()
  const worktree = findWorktreeById(projectRuntimeState.worktreesByRepo, worktreeId)
  if (!worktree) {
    return null
  }
  const repo =
    projectRuntimeState.repos.find((candidate) => candidate.id === worktree.repoId) ?? null
  if (!repo) {
    return null
  }
  const identity = getWorktreeGitIdentityDisplay(worktree)
  const branch = identity?.kind === 'branch' ? identity.branchName : null
  if (!branch) {
    return null
  }
  const settings = store.settings
  const prCacheKey = getGitHubPRCacheKey(
    repo.path,
    repo.id,
    branch,
    settings,
    repo.executionHostId,
    true
  )
  const hostedReviewCacheKey = getHostedReviewCacheKey(
    repo.path,
    branch,
    settings,
    repo.id,
    repo.executionHostId,
    true
  )
  const pr = prCacheKey ? (store.prCache[prCacheKey]?.data ?? null) : null
  const hostedReview = hostedReviewCacheKey
    ? (store.hostedReviewCache[hostedReviewCacheKey]?.data ?? null)
    : null
  return hostedReview ?? (pr ? gitHubPRToChecksPanelReview(pr) : null)
}

export function buildCheckRunDetailsFixBasePrompt(args: {
  worktreeId: string
  check: PRCheckDetail
  details: PRCheckRunDetails | null
}): string | null {
  const review = resolveHostedReviewForCheckRunDetailsFix(args.worktreeId)
  if (!review) {
    return null
  }
  const resolvedCheck = resolveCheckRunDetailsFixCheck(args.check, args.details)
  if (!isCheckRunDetailsFixCandidate(resolvedCheck)) {
    return null
  }
  const checkRunDetailsByCheckKey = args.details
    ? { [getCheckDetailsPromptKey(resolvedCheck, 0)]: args.details }
    : undefined
  return buildFixBrokenChecksPrompt({
    reviewNumber: review.number,
    reviewTitle: review.title,
    reviewUrl: review.url,
    checks: [resolvedCheck],
    checkRunDetailsByCheckKey
  })
}

export function getCheckRunDetailsFixDisabledReason(worktreeId: string | null): string | undefined {
  if (!worktreeId) {
    return translate(
      'auto.components.editor.check.run.details.fix.with.ai.1a8c4e2b90',
      'Select a workspace before launching an AI action.'
    )
  }
  const projectRuntimeState = readProjectCatalogRuntimeState()
  const worktree = findWorktreeById(projectRuntimeState.worktreesByRepo, worktreeId)
  if (!worktree) {
    return translate(
      'auto.components.editor.check.run.details.fix.with.ai.1a8c4e2b90',
      'Select a workspace before launching an AI action.'
    )
  }
  const repo =
    projectRuntimeState.repos.find((candidate) => candidate.id === worktree.repoId) ?? null
  if (!repo) {
    return translate(
      'auto.components.editor.check.run.details.fix.with.ai.4f2d9a8c17',
      'Select a repository before launching an AI action.'
    )
  }
  if (!resolveHostedReviewForCheckRunDetailsFix(worktreeId)) {
    return translate(
      'auto.components.editor.check.run.details.fix.with.ai.7c3e1b5d42',
      'Open a PR before launching an AI fix.'
    )
  }
  return undefined
}

export function resolveCheckRunDetailsFixRepo(worktreeId: string | null): Repo | null {
  if (!worktreeId) {
    return null
  }
  const projectRuntimeState = readProjectCatalogRuntimeState()
  const worktree = findWorktreeById(projectRuntimeState.worktreesByRepo, worktreeId)
  if (!worktree) {
    return null
  }
  return projectRuntimeState.repos.find((candidate) => candidate.id === worktree.repoId) ?? null
}
