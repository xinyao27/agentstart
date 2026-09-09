import type {
  GitHubPRRefreshCandidate,
  GitHubPRRefreshEnqueueResult,
  GitHubPRRefreshReason
} from '@yiru/protocol/hosted-review/pull-request-types'
import type { GitHubViewer } from '@yiru/protocol/hosted-review/review-types'
import type { AppStarSource } from '@yiru/protocol/telemetry/star-source'

import { shellClient } from './shell-client'

type LocalGitHubPRRefreshRequest = {
  candidate: GitHubPRRefreshCandidate
  reason: GitHubPRRefreshReason
  priority?: number
}

// Why: these operations belong to the window shell, not a selectable runtime
// host. The PR coordinator keys visibility by browser client id, while the
// identity/star calls intentionally use this installation's own `gh` session.
export function getShellGitHubViewer(): Promise<GitHubViewer | null> {
  return shellClient.gh.viewer()
}

export function enqueueShellGitHubPRRefresh(
  request: LocalGitHubPRRefreshRequest
): Promise<GitHubPRRefreshEnqueueResult | false> {
  return shellClient.gh.enqueuePRRefresh(request)
}

export function reportShellVisibleGitHubPRRefreshCandidates(args: {
  candidates: GitHubPRRefreshCandidate[]
  generation: number
}): Promise<boolean> {
  return shellClient.gh.reportVisiblePRRefreshCandidates(args)
}

export function checkShellYiruStarred(): Promise<boolean | null> {
  return shellClient.gh.checkYiruStarred()
}

export function starYiruFromShell(source: AppStarSource): Promise<boolean> {
  return shellClient.gh.starYiru(source)
}

export function completeShellStarNag(): Promise<void> {
  return shellClient.starNag.complete()
}
