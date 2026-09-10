import type { BaseRefSearchResult } from '@agentstart/protocol/git/worktree-source'
import { normalizeHostedReviewBaseRef } from '@agentstart/protocol/hosted-review/refs'

export function stripBaseRef(ref: string): string {
  return normalizeHostedReviewBaseRef(ref)
}

export function resolveCreateReviewDefaultBaseRef({
  currentBaseRef,
  eligibilityDefaultBaseRef
}: {
  currentBaseRef?: string | null
  eligibilityDefaultBaseRef?: string | null
}): string {
  // Why: eligibility is remote-validated and safer than a possibly local-only stacked parent.
  return stripBaseRef(eligibilityDefaultBaseRef?.trim() || currentBaseRef?.trim() || '')
}

export function normalizeCreateReviewBaseSearchResults(
  results: readonly BaseRefSearchResult[]
): string[] {
  const seen = new Set<string>()
  const branches: string[] = []
  for (const result of results) {
    const branch = stripBaseRef((result.localBranchName || result.refName).trim())
    if (!branch || seen.has(branch)) {
      continue
    }
    seen.add(branch)
    branches.push(branch)
  }
  return branches
}
