import type { GitHubWorkItem } from '@agentstart/protocol/hosted-review/review-types'
import type { ProjectSourceContext } from '@agentstart/protocol/project/source-context'
import { useMemo, type RefObject } from 'react'
import {
  normalizeGitHubLinkQuery,
  parseGitHubPullRequestLink,
  type RepoSlug
} from '~renderer/github/links'

import type { SmartWorkspaceRepo } from './github-repo-match'
import {
  getGithubSearchRequest,
  getVisibleGithubItems,
  githubSearchRequestsEqual,
  type CrossRepoPrompt,
  type GithubSearchTarget
} from './smart-workspace-github-search'
import {
  isSmartWorkspaceSourceQueryWithinLimit,
  type SmartNameMode
} from './smart-workspace-source-results'
import { useGithubSearchRequest } from './use-github-search-request'

type UseSmartGithubSearchOptions = {
  crossRepoSwitchTarget: 'project' | 'project-source'
  debouncedQuery: string
  disabled: boolean
  githubSourceContext: ProjectSourceContext | null
  handledCrossRepoUrl: string | null
  mode: SmartNameMode
  repoBackedSearchTargets: GithubSearchTarget[]
  repoBackedSourcesDisabled: boolean
  repoSlugCacheRef: RefObject<Map<string, RepoSlug | null>>
  repos: SmartWorkspaceRepo[]
  selectedRepo: SmartWorkspaceRepo | null
  setHandledCrossRepoUrl: (url: string) => void
  setCrossRepoPrompt: (prompt: CrossRepoPrompt | null) => void
  textOnly: boolean
}

export function useSmartGithubSearch({
  crossRepoSwitchTarget,
  debouncedQuery,
  disabled,
  githubSourceContext,
  handledCrossRepoUrl,
  mode,
  repoBackedSearchTargets,
  repoBackedSourcesDisabled,
  repoSlugCacheRef,
  repos,
  selectedRepo,
  setHandledCrossRepoUrl,
  setCrossRepoPrompt,
  textOnly
}: UseSmartGithubSearchOptions): { isLoading: boolean; items: GitHubWorkItem[] } {
  // Why: the request is tagged onto the results it produced and compared by
  // value downstream, so it must not gain a fresh identity every render or the
  // executor effect would re-run (and re-fetch) on render churn.
  const sourceQueryWithinLimit = isSmartWorkspaceSourceQueryWithinLimit(debouncedQuery)
  const normalizedQuery = useMemo(
    () => normalizeGitHubLinkQuery(sourceQueryWithinLimit ? debouncedQuery : ''),
    [debouncedQuery, sourceQueryWithinLimit]
  )
  const parsedLink = useMemo(
    () => (sourceQueryWithinLimit ? parseGitHubPullRequestLink(debouncedQuery) : null),
    [debouncedQuery, sourceQueryWithinLimit]
  )
  const targetRepoIds = useMemo(
    () => repoBackedSearchTargets.map((target) => target.repo.id),
    [repoBackedSearchTargets]
  )
  const selectedRepoId = selectedRepo?.id ?? null
  const request = useMemo(
    () =>
      getGithubSearchRequest({
        disabled,
        shouldQueryGithub:
          sourceQueryWithinLimit &&
          !repoBackedSourcesDisabled &&
          !textOnly &&
          targetRepoIds.length > 0 &&
          (mode === 'smart' || mode === 'github'),
        query: debouncedQuery.trim(),
        hasDirectNumber: normalizedQuery.directNumber !== null,
        hasDirectLink: parsedLink !== null,
        crossRepoLinkAlreadyHandled: handledCrossRepoUrl === debouncedQuery.trim(),
        crossRepoSwitchTarget,
        selectedRepoId,
        targetRepoIds
      }),
    [
      crossRepoSwitchTarget,
      debouncedQuery,
      disabled,
      handledCrossRepoUrl,
      mode,
      normalizedQuery,
      parsedLink,
      repoBackedSourcesDisabled,
      selectedRepoId,
      sourceQueryWithinLimit,
      targetRepoIds,
      textOnly
    ]
  )
  const { items, resultTag } = useGithubSearchRequest({
    githubSourceContext,
    normalizedQuery,
    parsedLink,
    repoBackedSearchTargets,
    repoSlugCacheRef,
    repos,
    request,
    selectedRepo,
    setHandledCrossRepoUrl,
    setCrossRepoPrompt
  })
  const isLoading = request !== null && !githubSearchRequestsEqual(request, resultTag)

  return {
    isLoading,
    items: getVisibleGithubItems({
      items,
      currentRequest: request,
      resultRequest: resultTag
    })
  }
}
