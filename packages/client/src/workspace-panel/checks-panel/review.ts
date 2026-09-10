import { hostedReviewInfoFromGitHubPRInfo } from '@agentstart/protocol/hosted-review/github-mapping'
import type { PRInfo } from '@agentstart/protocol/hosted-review/pull-request-types'
import type { HostedReviewInfo } from '@agentstart/protocol/hosted-review/types'

export type ChecksPanelReview = HostedReviewInfo

export type ChecksPanelReviewSelectionInput = {
  hostedReview: HostedReviewInfo | null | undefined
  pr: PRInfo | null | undefined
}

export function gitHubPRToChecksPanelReview(pr: PRInfo): ChecksPanelReview {
  // Why: the checks panel must not maintain a second GitHub PR metadata mapper;
  // merge-state fields drifting here regressed the right-sidebar action label.
  return hostedReviewInfoFromGitHubPRInfo(pr)
}

export function selectChecksPanelReview({
  hostedReview,
  pr
}: ChecksPanelReviewSelectionInput): ChecksPanelReview | null {
  return pr ? gitHubPRToChecksPanelReview(pr) : (hostedReview ?? null)
}
