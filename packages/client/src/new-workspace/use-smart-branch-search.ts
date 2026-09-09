import type { BaseRefSearchResult } from '@yiru/protocol/git/worktree-source'
import { getRepoExecutionHostId } from '@yiru/protocol/host/identity'
import { useEffect, useState } from 'react'
import { getRepoOwnerRoutedSettings } from '~renderer/repo/runtime-owner'
import {
  getRuntimeRepoBaseRefDefault,
  searchRuntimeRepoBaseRefDetails
} from '~renderer/runtime/repo-client'
import { useAppStore } from '~renderer/store/state'

import type { SmartWorkspaceRepo } from './github-repo-match'
import {
  getBranchSearchRequest,
  getVisibleBranchResults,
  type SmartNameMode
} from './smart-workspace-source-results'

const RESULT_LIMIT = 12

type UseSmartBranchSearchOptions = {
  branchesEnabled: boolean
  debouncedQuery: string
  disabled: boolean
  mode: SmartNameMode
  repoBackedSourcesDisabled: boolean
  selectedRepo: SmartWorkspaceRepo | null
  textOnly: boolean
  value: string
}

export function useSmartBranchSearch({
  branchesEnabled,
  debouncedQuery,
  disabled,
  mode,
  repoBackedSourcesDisabled,
  selectedRepo,
  textOnly,
  value
}: UseSmartBranchSearchOptions): { isLoading: boolean; items: BaseRefSearchResult[] } {
  const settings = useAppStore((state) => state.settings)
  const [items, setItems] = useState<BaseRefSearchResult[]>([])
  const [defaultBaseRef, setDefaultBaseRef] = useState<string | null>(null)
  const [resultSource, setResultSource] = useState<{ repoId: string; query: string } | null>(null)
  const request = getBranchSearchRequest({
    disabled,
    branchesEnabled: branchesEnabled && !repoBackedSourcesDisabled,
    textOnly,
    mode,
    selectedRepoId: selectedRepo?.id ?? null,
    query: debouncedQuery,
    limit: RESULT_LIMIT
  })
  const ownerSettings = getRepoOwnerRoutedSettings(settings, selectedRepo)
  const hostId = selectedRepo ? getRepoExecutionHostId(selectedRepo) : undefined
  const isLoading =
    request !== null &&
    (resultSource === null ||
      resultSource.repoId !== request.repoId ||
      resultSource.query !== request.query)

  useEffect(() => {
    if (!request) {
      return
    }
    let isStale = false
    const defaultRequest =
      request.query.length === 0
        ? getRuntimeRepoBaseRefDefault(ownerSettings, request.repoId, hostId).then(
            ({ defaultBaseRef: nextDefault }) => nextDefault
          )
        : Promise.resolve(null)
    void Promise.all([
      searchRuntimeRepoBaseRefDetails(
        ownerSettings,
        request.repoId,
        request.query,
        request.limit,
        hostId
      ),
      defaultRequest.catch(() => null)
    ])
      .then(([results, nextDefault]) => {
        if (!isStale) {
          setItems(results)
          setDefaultBaseRef(nextDefault)
          setResultSource({ repoId: request.repoId, query: request.query })
        }
      })
      .catch(() => {
        if (!isStale) {
          setItems([])
          setDefaultBaseRef(null)
          setResultSource({ repoId: request.repoId, query: request.query })
        }
      })
    return () => {
      isStale = true
    }
  }, [hostId, ownerSettings, request])

  return {
    isLoading,
    items: getVisibleBranchResults({
      branches: items,
      defaultBaseRef,
      mode,
      resultRepoId: resultSource?.repoId ?? null,
      resultQuery: resultSource?.query ?? null,
      selectedRepoId: selectedRepo?.id ?? null,
      value
    })
  }
}
