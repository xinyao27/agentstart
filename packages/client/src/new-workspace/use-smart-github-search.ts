import type { GitHubWorkItem } from '@agentstart/protocol/hosted-review/review-types'
import type { ProjectSourceContext } from '@agentstart/protocol/project/source-context'
import { useEffect, useState, type RefObject } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  normalizeGitHubLinkQuery,
  parseGitHubPullRequestLink,
  type RepoSlug
} from '~renderer/github/links'
import {
  lookupGitHubWorkItemByOwnerRepoForSource,
  lookupGitHubWorkItemForSource
} from '~renderer/github/work-item-source-lookup'
import { useAppStore } from '~renderer/store/state'

import {
  findRepoForSlug,
  getRepoSlugCached,
  sameRepoSlug,
  type SmartWorkspaceRepo
} from './github-repo-match'
import { lookupSmartGitHubSubmitItem } from './smart-github-submit'
import {
  getGithubSearchRequest,
  getVisibleGithubItems,
  githubSearchRequestsEqual,
  type SmartWorkspaceGithubSearchRequest
} from './smart-workspace-github-search'
import {
  isSmartWorkspaceSourceQueryWithinLimit,
  type SmartNameMode
} from './smart-workspace-source-results'

const RESULT_LIMIT = 12

type SmartWorkspaceSearchTarget = {
  repo: SmartWorkspaceRepo
  githubSourceContext: ProjectSourceContext | null
}

export type CrossRepoPrompt = {
  query: string
  link: NonNullable<ReturnType<typeof parseGitHubPullRequestLink>>
  matchingRepo: SmartWorkspaceRepo | null
}

type UseSmartGithubSearchOptions = {
  crossRepoSwitchTarget: 'project' | 'project-source'
  debouncedQuery: string
  disabled: boolean
  githubSourceContext: ProjectSourceContext | null
  handledCrossRepoUrl: string | null
  mode: SmartNameMode
  repoBackedSearchTargets: SmartWorkspaceSearchTarget[]
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
  const { fetchWorkItems, fetchWorkItemsAcrossRepos, getCachedWorkItems } = useAppStore(
    useShallow((state) => ({
      fetchWorkItems: state.fetchWorkItems,
      fetchWorkItemsAcrossRepos: state.fetchWorkItemsAcrossRepos,
      getCachedWorkItems: state.getCachedWorkItems
    }))
  )
  const [items, setItems] = useState<GitHubWorkItem[]>([])
  const [resultTag, setResultTag] = useState<SmartWorkspaceGithubSearchRequest | null>(null)
  const sourceQueryWithinLimit = isSmartWorkspaceSourceQueryWithinLimit(debouncedQuery)
  const normalizedQuery = normalizeGitHubLinkQuery(sourceQueryWithinLimit ? debouncedQuery : '')
  const parsedLink = sourceQueryWithinLimit ? parseGitHubPullRequestLink(debouncedQuery) : null
  const request = getGithubSearchRequest({
    disabled,
    shouldQueryGithub:
      sourceQueryWithinLimit &&
      !repoBackedSourcesDisabled &&
      !textOnly &&
      repoBackedSearchTargets.length > 0 &&
      (mode === 'smart' || mode === 'github'),
    query: debouncedQuery.trim(),
    hasDirectNumber: normalizedQuery.directNumber !== null,
    hasDirectLink: parsedLink !== null,
    crossRepoLinkAlreadyHandled: handledCrossRepoUrl === debouncedQuery.trim(),
    crossRepoSwitchTarget,
    selectedRepoId: selectedRepo?.id ?? null,
    targetRepoIds: repoBackedSearchTargets.map((target) => target.repo.id)
  })
  const isLoading = request !== null && !githubSearchRequestsEqual(request, resultTag)
  const visibleItems = getVisibleGithubItems({
    items,
    currentRequest: request,
    resultRequest: resultTag
  })

  useEffect(() => {
    if (!request) {
      return
    }
    let isStale = false
    const commitItems = (nextItems: GitHubWorkItem[]): void => {
      if (!isStale) {
        setItems(nextItems)
        setResultTag(request)
      }
    }
    const targetForRepo = (repo: SmartWorkspaceRepo) =>
      repoBackedSearchTargets.find((target) => target.repo.id === repo.id)
    if (request.kind === 'cross-repo-link-project' || request.kind === 'cross-repo-link-sources') {
      if (!parsedLink) {
        return
      }
      const lookup = async (): Promise<{
        items: GitHubWorkItem[]
        prompt: CrossRepoPrompt | null
      }> => {
        if (request.kind === 'cross-repo-link-sources') {
          const matchingRepo = await findRepoForSlug(
            repoBackedSearchTargets.map((target) => target.repo),
            parsedLink.slug,
            repoSlugCacheRef.current
          )
          setHandledCrossRepoUrl(request.query)
          const target = matchingRepo ? targetForRepo(matchingRepo) : null
          if (!target) {
            return { items: [], prompt: null }
          }
          const item = await lookupGitHubWorkItemByOwnerRepoForSource({
            repoPath: target.repo.path,
            repoId: target.repo.id,
            sourceContext: target.githubSourceContext,
            owner: parsedLink.slug.owner,
            repo: parsedLink.slug.repo,
            number: parsedLink.number,
            type: parsedLink.type
          })
          return { items: item ? [{ ...item, repoId: target.repo.id }] : [], prompt: null }
        }
        if (!selectedRepo?.path) {
          return { items: [], prompt: null }
        }
        const selectedSlug = await getRepoSlugCached(selectedRepo, repoSlugCacheRef.current)
        if (!selectedSlug || sameRepoSlug(selectedSlug, parsedLink.slug)) {
          setHandledCrossRepoUrl(request.query)
          const item = await lookupSmartGitHubSubmitItem({
            repoPath: selectedRepo.path,
            repoId: selectedRepo.id,
            sourceContext: githubSourceContext,
            intent: {
              kind: 'link',
              owner: parsedLink.slug.owner,
              repo: parsedLink.slug.repo,
              number: parsedLink.number,
              type: parsedLink.type
            },
            workItem: lookupGitHubWorkItemForSource,
            workItemByOwnerRepo: lookupGitHubWorkItemByOwnerRepoForSource
          })
          return { items: item ? [item] : [], prompt: null }
        }
        const matchingRepo = await findRepoForSlug(repos, parsedLink.slug, repoSlugCacheRef.current)
        return {
          items: [],
          prompt: { query: request.query, link: parsedLink, matchingRepo }
        }
      }
      void lookup()
        .then((result) => {
          commitItems(result.items)
          if (!isStale && result.prompt) {
            setCrossRepoPrompt(result.prompt)
          }
        })
        .catch(() => commitItems([]))
      return () => {
        isStale = true
      }
    }
    if (request.kind === 'link-lookup') {
      if (normalizedQuery.directNumber === null) {
        return
      }
      const intent = parsedLink
        ? {
            kind: 'link' as const,
            owner: parsedLink.slug.owner,
            repo: parsedLink.slug.repo,
            number: parsedLink.number,
            type: parsedLink.type
          }
        : { kind: 'hash-number' as const, number: normalizedQuery.directNumber }
      void Promise.all(
        repoBackedSearchTargets.map((target) =>
          lookupSmartGitHubSubmitItem({
            repoPath: target.repo.path,
            repoId: target.repo.id,
            sourceContext: target.githubSourceContext,
            intent,
            workItem: lookupGitHubWorkItemForSource,
            workItemByOwnerRepo: lookupGitHubWorkItemByOwnerRepoForSource
          }).catch(() => null)
        )
      ).then((results) =>
        commitItems(
          results
            .filter((item): item is GitHubWorkItem => item !== null)
            .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
            .slice(0, RESULT_LIMIT)
        )
      )
      return () => {
        isStale = true
      }
    }
    if (request.kind === 'single-repo') {
      const target = repoBackedSearchTargets.find((entry) => entry.repo.id === request.repoId)
      if (!target) {
        return
      }
      const query = normalizedQuery.query.trim() ? normalizedQuery.query : ''
      const cached = getCachedWorkItems(
        target.repo.id,
        RESULT_LIMIT,
        query,
        target.repo.path,
        target.githubSourceContext
      )
      if (cached) {
        commitItems(cached.slice(0, RESULT_LIMIT))
      }
      void fetchWorkItems(target.repo.id, target.repo.path, RESULT_LIMIT, query, {
        sourceContext: target.githubSourceContext
      })
        .then((results) => commitItems(results.slice(0, RESULT_LIMIT)))
        .catch(() => commitItems([]))
      return () => {
        isStale = true
      }
    }
    const query = normalizedQuery.query.trim() ? normalizedQuery.query : ''
    void fetchWorkItemsAcrossRepos(
      repoBackedSearchTargets.map((target) => ({
        repoId: target.repo.id,
        path: target.repo.path,
        executionHostId: target.repo.executionHostId,
        sourceContext: target.githubSourceContext
      })),
      RESULT_LIMIT,
      RESULT_LIMIT,
      query
    )
      .then((result) => commitItems(result.items))
      .catch(() => commitItems([]))
    return () => {
      isStale = true
    }
  }, [
    fetchWorkItems,
    fetchWorkItemsAcrossRepos,
    getCachedWorkItems,
    githubSourceContext,
    handledCrossRepoUrl,
    normalizedQuery,
    parsedLink,
    repoBackedSearchTargets,
    repoSlugCacheRef,
    repos,
    request,
    selectedRepo,
    setHandledCrossRepoUrl,
    setCrossRepoPrompt
  ])

  return { isLoading, items: visibleItems }
}
