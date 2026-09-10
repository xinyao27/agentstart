import type { GitHubWorkItem } from '@agentstart/protocol/hosted-review/review-types'
import type { Repo } from '@agentstart/protocol/project/repository'
import type { ProjectSourceContext } from '@agentstart/protocol/project/source-context'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { useEffect, useState } from 'react'
import { normalizeGitHubLinkQuery } from '~renderer/github/links'
import {
  lookupGitHubWorkItemByOwnerRepoForSource,
  lookupGitHubWorkItemForSource
} from '~renderer/github/work-item-source-lookup'
import { runtimeCallDestination } from '~renderer/runtime/github-runtime-destination'
import { openGitHubTarget } from '~renderer/runtime/github-target'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'

type UseLinkedWorkItemPickerOptions = {
  selectedRepo: Repo | null | undefined
  selectedRepoGitHubSourceContext: ProjectSourceContext | null
  selectedRepoIsGit: boolean
  selectedRepoSettings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
}

export function useLinkedWorkItemPicker({
  selectedRepo,
  selectedRepoGitHubSourceContext,
  selectedRepoIsGit,
  selectedRepoSettings
}: UseLinkedWorkItemPickerOptions) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [listResult, setListResult] = useState<{
    repoId: string
    items: GitHubWorkItem[]
  } | null>(null)
  const [directResult, setDirectResult] = useState<{
    requestKey: string
    item: GitHubWorkItem | null
  } | null>(null)
  const normalizedQuery = normalizeGitHubLinkQuery(debouncedQuery)
  const listRequestRepoId = isOpen && selectedRepoIsGit ? (selectedRepo?.id ?? null) : null
  const items = listResult?.repoId === listRequestRepoId ? listResult.items : []
  const directRequestKey =
    listRequestRepoId && normalizedQuery.directNumber !== null
      ? `${listRequestRepoId}:${normalizedQuery.directLink?.slug.owner ?? ''}:${normalizedQuery.directLink?.slug.repo ?? ''}:${normalizedQuery.directNumber}`
      : null
  const directItem = directResult?.requestKey === directRequestKey ? directResult.item : null
  const isLoading = listRequestRepoId !== null && listResult?.repoId !== listRequestRepoId
  const isDirectLoading = directRequestKey !== null && directResult?.requestKey !== directRequestKey
  const filteredItems = (() => {
    if (normalizedQuery.tooLarge) {
      return []
    }
    if (normalizedQuery.directNumber !== null) {
      return directItem ? [directItem] : []
    }
    const normalizedText = normalizedQuery.query.trim().toLowerCase()
    if (!normalizedText) {
      return items
    }
    return items.filter((item) =>
      [
        item.type,
        item.number,
        item.title,
        item.author ?? '',
        item.labels.join(' '),
        item.branchName ?? '',
        item.baseRefName ?? ''
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedText)
    )
  })()

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), 250)
    return () => window.clearTimeout(timeout)
  }, [query])

  useEffect(() => {
    if (!isOpen || !selectedRepo || !selectedRepoIsGit) {
      return
    }
    let isCancelled = false
    const target = getActiveRuntimeTarget(selectedRepoSettings)
    void openGitHubTarget()
      .then((client) => {
        if (!client) {
          throw new Error('GitHub protocol capability is unavailable')
        }
        return client.listWorkItems(
          { repo: selectedRepo.id, limit: 100 },
          { timeoutMs: 30_000, ...runtimeCallDestination(target) }
        )
      })
      .then((envelope) => {
        if (!isCancelled) {
          setListResult({
            repoId: selectedRepo.id,
            items: envelope.items.map((item) => ({ ...item, repoId: selectedRepo.id }))
          })
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setListResult({ repoId: selectedRepo.id, items: [] })
        }
      })
    return () => {
      isCancelled = true
    }
  }, [isOpen, selectedRepo, selectedRepoIsGit, selectedRepoSettings])

  useEffect(() => {
    const directNumber = normalizedQuery.directNumber
    if (
      !isOpen ||
      !selectedRepo ||
      !selectedRepoIsGit ||
      directRequestKey === null ||
      directNumber === null
    ) {
      return
    }
    let isCancelled = false
    const lookup = normalizedQuery.directLink
      ? lookupGitHubWorkItemByOwnerRepoForSource({
          repoPath: selectedRepo.path,
          repoId: selectedRepo.id,
          sourceContext: selectedRepoGitHubSourceContext,
          owner: normalizedQuery.directLink.slug.owner,
          repo: normalizedQuery.directLink.slug.repo,
          number: normalizedQuery.directLink.number,
          type: normalizedQuery.directLink.type
        })
      : lookupGitHubWorkItemForSource({
          repoPath: selectedRepo.path,
          repoId: selectedRepo.id,
          sourceContext: selectedRepoGitHubSourceContext,
          number: directNumber
        })
    void lookup
      .then((item) => {
        if (!isCancelled) {
          setDirectResult({
            requestKey: directRequestKey,
            item: item ? { ...item, repoId: selectedRepo.id } : null
          })
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setDirectResult({ requestKey: directRequestKey, item: null })
        }
      })
    return () => {
      isCancelled = true
    }
  }, [
    isOpen,
    directRequestKey,
    normalizedQuery.directLink,
    normalizedQuery.directNumber,
    selectedRepo,
    selectedRepoGitHubSourceContext,
    selectedRepoIsGit
  ])

  const setOpen = (open: boolean): void => {
    setIsOpen(open)
    if (!open) {
      setQuery('')
      setDebouncedQuery('')
    }
  }

  return {
    filteredItems,
    isDirectLoading,
    isLoading,
    isOpen,
    normalizedQuery,
    query,
    setOpen,
    setQuery
  }
}
