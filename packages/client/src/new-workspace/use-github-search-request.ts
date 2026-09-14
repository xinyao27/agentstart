import type { GitHubWorkItem } from '@agentstart/protocol/hosted-review/review-types'
import type { ProjectSourceContext } from '@agentstart/protocol/project/source-context'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { GitHubLinkQuery, parseGitHubPullRequestLink, RepoSlug } from '~renderer/github/links'
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
  githubSearchRequestsEqual,
  type CrossRepoPrompt,
  type GithubSearchTarget,
  type SmartWorkspaceGithubSearchRequest
} from './smart-workspace-github-search'

const RESULT_LIMIT = 12

type UseGithubSearchRequestOptions = {
  githubSourceContext: ProjectSourceContext | null
  normalizedQuery: GitHubLinkQuery
  parsedLink: ReturnType<typeof parseGitHubPullRequestLink>
  repoBackedSearchTargets: GithubSearchTarget[]
  repoSlugCacheRef: RefObject<Map<string, RepoSlug | null>>
  repos: SmartWorkspaceRepo[]
  request: SmartWorkspaceGithubSearchRequest | null
  selectedRepo: SmartWorkspaceRepo | null
  setHandledCrossRepoUrl: (url: string) => void
  setCrossRepoPrompt: (prompt: CrossRepoPrompt | null) => void
}

// Why: executes one SmartWorkspaceGithubSearchRequest and returns the items
// tagged with the request that produced them; visibility and loading are
// derived from the tag by the caller, purely at render time.
export function useGithubSearchRequest({
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
}: UseGithubSearchRequestOptions): {
  items: GitHubWorkItem[]
  resultTag: SmartWorkspaceGithubSearchRequest | null
} {
  const { fetchWorkItems, fetchWorkItemsAcrossRepos, getCachedWorkItems } = useAppStore(
    useShallow((state) => ({
      fetchWorkItems: state.fetchWorkItems,
      fetchWorkItemsAcrossRepos: state.fetchWorkItemsAcrossRepos,
      getCachedWorkItems: state.getCachedWorkItems
    }))
  )
  const [items, setItems] = useState<GitHubWorkItem[]>([])
  const [resultTag, setResultTag] = useState<SmartWorkspaceGithubSearchRequest | null>(null)
  // Why: the tag mirror lets the effect compare by value, not identity — re-runs
  // triggered by upstream prop churn must not restart an identical request, and
  // the single-repo cache path commits synchronously, so a redundant commit
  // would loop forever.
  const resultTagRef = useRef<SmartWorkspaceGithubSearchRequest | null>(null)

  useEffect(() => {
    if (!request || githubSearchRequestsEqual(request, resultTagRef.current)) {
      return
    }
    let isStale = false
    const commitItems = (nextItems: GitHubWorkItem[]): void => {
      if (!isStale) {
        resultTagRef.current = request
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
        // Why: commit outside the effect's synchronous pass — a synchronous
        // commit here re-renders before this effect has finished, which is how
        // the composer modal used to hit maximum update depth.
        queueMicrotask(() => commitItems(cached.slice(0, RESULT_LIMIT)))
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

  return { items, resultTag }
}
