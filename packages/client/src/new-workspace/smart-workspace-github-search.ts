import type { GitHubWorkItem } from '@agentstart/protocol/hosted-review/review-types'

// Why: the smart-name field's GitHub search has three mutually exclusive
// fetch shapes (resolve a pasted cross-repo link, look an issue/PR number up
// across every search target, or run a plain query against one/many repos).
// Tagging stored items with which shape produced them lets the field derive
// visibility and loading purely at render time — a stored batch whose tag
// doesn't match the live request simply isn't shown, so a repo/target-set
// change (including one that happens while the field is disabled, when the
// mode tabs stay reachable) can never leak a stale repo's items onto screen.
export type SmartWorkspaceGithubSearchRequest =
  | { kind: 'cross-repo-link-project'; query: string; repoId: string | null }
  | { kind: 'cross-repo-link-sources'; query: string; targetRepoIds: readonly string[] }
  | { kind: 'link-lookup'; query: string; targetRepoIds: readonly string[] }
  | { kind: 'single-repo'; query: string; repoId: string }
  | { kind: 'multi-repo'; query: string; targetRepoIds: readonly string[] }

// Why: plain (not readonly) to match buildSmartWorkspaceSourceRows's existing
// githubItems: GitHubWorkItem[] parameter shape.
const EMPTY_GITHUB_ITEMS: GitHubWorkItem[] = []

function githubRequestKey(request: SmartWorkspaceGithubSearchRequest): string {
  switch (request.kind) {
    case 'cross-repo-link-project':
    case 'single-repo':
      return `${request.kind}:${request.query}:${request.repoId ?? ''}`
    case 'cross-repo-link-sources':
    case 'link-lookup':
    case 'multi-repo':
      return `${request.kind}:${request.query}:${request.targetRepoIds.join(',')}`
  }
}

export function githubSearchRequestsEqual(
  a: SmartWorkspaceGithubSearchRequest | null,
  b: SmartWorkspaceGithubSearchRequest | null
): boolean {
  if (a === null || b === null) {
    return a === null && b === null
  }
  return githubRequestKey(a) === githubRequestKey(b)
}

export function getVisibleGithubItems({
  items,
  currentRequest,
  resultRequest
}: {
  items: GitHubWorkItem[]
  currentRequest: SmartWorkspaceGithubSearchRequest | null
  resultRequest: SmartWorkspaceGithubSearchRequest | null
}): GitHubWorkItem[] {
  if (currentRequest === null) {
    return EMPTY_GITHUB_ITEMS
  }
  return githubSearchRequestsEqual(currentRequest, resultRequest) ? items : EMPTY_GITHUB_ITEMS
}

export function getGithubSearchRequest({
  disabled,
  shouldQueryGithub,
  query,
  hasDirectNumber,
  hasDirectLink,
  crossRepoLinkAlreadyHandled,
  crossRepoSwitchTarget,
  selectedRepoId,
  targetRepoIds
}: {
  disabled: boolean
  shouldQueryGithub: boolean
  query: string
  hasDirectNumber: boolean
  hasDirectLink: boolean
  crossRepoLinkAlreadyHandled: boolean
  crossRepoSwitchTarget: 'project' | 'project-source'
  selectedRepoId: string | null
  targetRepoIds: readonly string[]
}): SmartWorkspaceGithubSearchRequest | null {
  if (disabled || !shouldQueryGithub) {
    return null
  }
  if (hasDirectLink && !crossRepoLinkAlreadyHandled) {
    return crossRepoSwitchTarget === 'project-source'
      ? { kind: 'cross-repo-link-sources', query, targetRepoIds }
      : { kind: 'cross-repo-link-project', query, repoId: selectedRepoId }
  }
  if (hasDirectNumber) {
    return { kind: 'link-lookup', query, targetRepoIds }
  }
  return targetRepoIds.length === 1
    ? { kind: 'single-repo', query, repoId: targetRepoIds[0] }
    : { kind: 'multi-repo', query, targetRepoIds }
}
