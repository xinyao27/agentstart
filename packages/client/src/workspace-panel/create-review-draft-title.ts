import { normalizeHostedReviewHeadRef } from '@yiru/protocol/hosted-review/refs'
import { humanizeBranchSlug } from '~renderer/new-workspace/naming/from-work'

export function resolveCreateReviewDraftTitle({
  branch,
  eligibilityTitle
}: {
  branch: string
  eligibilityTitle?: string | null
}): string {
  const title = eligibilityTitle?.trim()
  if (title) {
    return title
  }
  const normalizedBranch = normalizeHostedReviewHeadRef(branch)
  const branchLeaf = normalizedBranch.split('/').pop()?.replace(/_/g, '-') ?? ''
  return humanizeBranchSlug(branchLeaf) || normalizedBranch
}
