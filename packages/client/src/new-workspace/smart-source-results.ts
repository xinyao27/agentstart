import type { BaseRefSearchResult } from '@agentstart/protocol/git/worktree-source'
import type { GitHubWorkItem } from '@agentstart/protocol/hosted-review/review-types'
import { isUtf8ByteLengthOverLimit } from '@agentstart/protocol/text/utf8-length'
import { translate } from '~renderer/i18n/i18n'
import { legacyBaseRefSearchResult } from '~renderer/new-workspace/base-ref-result'

export type SmartNameMode = 'smart' | 'github' | 'branches' | 'text'

const SMART_WORKSPACE_SOURCE_QUERY_MAX_BYTES = 2048

export type SmartWorkspaceSourceRow =
  | { kind: 'use-name'; value: string; name: string }
  | { kind: 'create-branch'; value: string; name: string }
  | { kind: 'github'; value: string; item: GitHubWorkItem & { type: 'pr' } }
  | { kind: 'branch'; value: string; refName: string; localBranchName: string }

function emptyHints(): Record<SmartNameMode, string> {
  return {
    smart: translate(
      'newWorkspace.sourceHint.smart',
      'Start typing to create a name or find a source.'
    ),
    github: translate(
      'newWorkspace.sourceHint.github',
      'Start typing to search GitHub pull requests.'
    ),
    branches: translate('newWorkspace.sourceHint.branches', 'No matching branches.'),
    text: ''
  }
}

export function getSmartWorkspaceEmptyHint(mode: SmartNameMode): string {
  return emptyHints()[mode]
}

export function isSmartWorkspaceSourceQueryWithinLimit(
  query: string,
  maxBytes = SMART_WORKSPACE_SOURCE_QUERY_MAX_BYTES
): boolean {
  return !isUtf8ByteLengthOverLimit(query, maxBytes)
}

export function getBranchSearchRequest({
  branchesEnabled,
  disabled,
  textOnly,
  mode,
  selectedRepoId,
  query,
  limit
}: {
  branchesEnabled?: boolean
  disabled: boolean
  textOnly: boolean
  mode: SmartNameMode
  selectedRepoId: string | null
  query: string
  limit: number
}): { repoId: string; query: string; limit: number } | null {
  if (
    branchesEnabled === false ||
    disabled ||
    textOnly ||
    !isSmartWorkspaceSourceQueryWithinLimit(query) ||
    !selectedRepoId
  ) {
    return null
  }
  const trimmedQuery = query.trim()
  const shouldSearchBranches = mode === 'branches' || (mode === 'smart' && trimmedQuery.length > 0)
  if (!shouldSearchBranches) {
    return null
  }
  return { repoId: selectedRepoId, query: trimmedQuery, limit }
}

export function getVisibleBranchResults({
  branches,
  defaultBaseRef,
  mode,
  resultRepoId,
  resultQuery,
  selectedRepoId,
  value
}: {
  branches: BaseRefSearchResult[]
  defaultBaseRef: string | null
  mode: SmartNameMode
  resultRepoId: string | null
  resultQuery: string | null
  selectedRepoId: string | null
  value: string
}): BaseRefSearchResult[] {
  if (!isSmartWorkspaceSourceQueryWithinLimit(value)) {
    return []
  }
  const currentQuery = value.trim()
  if (mode !== 'branches' && mode !== 'smart') {
    return []
  }
  if (!selectedRepoId || resultRepoId !== selectedRepoId || resultQuery !== currentQuery) {
    return []
  }
  if (currentQuery.length > 0) {
    return branches
  }
  const normalizedDefaultBaseRef = defaultBaseRef?.trim()
  const existingConventionalBranch =
    branches.find(({ refName }) => refName === 'origin/main') ??
    branches.find(({ refName }) => refName === 'main')
  const resolvedConventionalRef =
    normalizedDefaultBaseRef === 'origin/main' || normalizedDefaultBaseRef === 'main'
      ? normalizedDefaultBaseRef
      : null
  const preferredBranch =
    existingConventionalBranch ??
    (resolvedConventionalRef ? legacyBaseRefSearchResult(resolvedConventionalRef) : null)
  if (!preferredBranch || branches[0]?.refName === preferredBranch.refName) {
    return branches
  }
  // Why: empty branch mode starts from origin/main or main even when default
  // detection fails, while typed queries preserve Git's relevance order.
  return [preferredBranch, ...branches.filter(({ refName }) => refName !== preferredBranch.refName)]
}

export function buildSmartWorkspaceSourceRows({
  branches,
  githubItems,
  mode,
  resultLimit,
  value
}: {
  branches: BaseRefSearchResult[]
  githubItems: GitHubWorkItem[]
  mode: SmartNameMode
  resultLimit: number
  value: string
}): SmartWorkspaceSourceRow[] {
  if (!isSmartWorkspaceSourceQueryWithinLimit(value)) {
    return []
  }
  const trimmed = value.trim()
  const nextRows: SmartWorkspaceSourceRow[] = []
  if (trimmed && mode === 'smart') {
    nextRows.push({ kind: 'use-name', value: `use-name-${trimmed}`, name: trimmed })
  }
  if (mode === 'text') {
    return nextRows
  }
  if (mode === 'smart' || mode === 'github') {
    nextRows.push(
      ...githubItems
        .filter((item): item is GitHubWorkItem & { type: 'pr' } => item.type === 'pr')
        .map((item) => ({
          kind: 'github' as const,
          value: `github-${item.repoId}-pr-${item.number}`,
          item
        }))
    )
  }
  const shouldShowBranches = mode === 'branches' || (mode === 'smart' && trimmed.length > 0)
  if (shouldShowBranches) {
    const branchExactMatch = branches.some(
      (branch) => branch.refName === trimmed || branch.localBranchName === trimmed
    )
    if (trimmed && mode === 'branches' && !branchExactMatch) {
      nextRows.push({ kind: 'create-branch', value: `create-branch-${trimmed}`, name: trimmed })
    }
    nextRows.push(
      ...branches.map((branch) => ({
        kind: 'branch' as const,
        value: `branch-${branch.refName}`,
        refName: branch.refName,
        localBranchName: branch.localBranchName
      }))
    )
  }
  return nextRows.slice(0, resultLimit + 1)
}
