import type { BaseRefSearchResult } from '@agentstart/protocol/git/worktree-source'
import { getRepoExecutionHostId } from '@agentstart/protocol/host/identity'
import { useEffect, useMemo, useState } from 'react'
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
  // Why: both derivations allocate a fresh object per call, and they feed the
  // fetch effect's dependency list — unmemoized, every render would re-run the
  // effect and fire another branch search.
  const ownerSettings = useMemo(
    () => getRepoOwnerRoutedSettings(settings, selectedRepo),
    [selectedRepo, settings]
  )
  const hostId = selectedRepo ? getRepoExecutionHostId(selectedRepo) : undefined
  const selectedRepoId = selectedRepo?.id ?? null
  const request = useMemo(
    () =>
      getBranchSearchRequest({
        disabled,
        branchesEnabled: branchesEnabled && !repoBackedSourcesDisabled,
        textOnly,
        mode,
        selectedRepoId,
        query: debouncedQuery,
        limit: RESULT_LIMIT
      }),
    [
      branchesEnabled,
      debouncedQuery,
      disabled,
      mode,
      repoBackedSourcesDisabled,
      selectedRepoId,
      textOnly
    ]
  )
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
