import type { GitHubPRRefreshReason } from '@yiru/protocol/hosted-review/pull-request-types'

type ChecksPanelPRRefreshRequestInput = {
  cachedHasPR: boolean | null
  cachedFetchedAt: number | null
  panelVisibleSince: number | null
}

type ChecksPanelPRRefreshRequest = {
  reason: GitHubPRRefreshReason
  priority: number
}

export function resolveChecksPanelPRRefreshRequest(
  input: ChecksPanelPRRefreshRequestInput
): ChecksPanelPRRefreshRequest {
  const cachedMissPredatesVisiblePanel =
    input.cachedHasPR === false &&
    input.cachedFetchedAt !== null &&
    input.panelVisibleSince !== null &&
    input.cachedFetchedAt < input.panelVisibleSince

  if (cachedMissPredatesVisiblePanel) {
    // Why: external agents can create/merge a PR after Yiru cached "none";
    // visible empty-state checks need one foreground lookup to recover.
    return { reason: 'active', priority: 80 }
  }

  return { reason: 'swr', priority: 30 }
}
