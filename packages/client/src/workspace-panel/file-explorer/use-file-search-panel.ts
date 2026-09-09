import type {
  SearchFileResult,
  SearchMatch,
  FileSearchResult as SearchResult
} from '@yiru/protocol/files/values'
import type React from 'react'
import { useDeferredValue, useEffect, useRef } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useActiveWorktree } from '~renderer/store/selectors'
import { useAppStore } from '~renderer/store/state'

import type { SearchFiltersProps } from '../search-filters'
import { cancelRevealFrame, openMatchResult } from '../search-match-open'
import type { SearchQueryRowProps } from '../search-query-row'
import { buildSearchRows } from '../search-rows'
import { useFileSearchRunner } from './use-file-search-runner'
import { useFileSearchToggles } from './use-file-search-toggles'

const EMPTY_COLLAPSED_FILES = new Set<string>()

export type FileSearchPanelModel = {
  activeWorktreeId: string | null
  queryRowProps: SearchQueryRowProps
  filtersProps: SearchFiltersProps
  resultsProps: {
    results: SearchResult | null
    hasCommittedResults: boolean
    query: string
    loading: boolean
    rows: ReturnType<typeof buildSearchRows>
    onToggleCollapsedFile: (filePath: string) => void
    onMatchClick: (fileResult: SearchFileResult, match: SearchMatch, preview: boolean) => void
  }
  focusQueryInput: () => void
}

export function useFileSearchPanel(
  explorerView: 'files' | 'search',
  workspacePanelTabId?: string
): FileSearchPanelModel {
  const activeWorktree = useActiveWorktree()
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const openFile = useAppStore((s) => s.openFile)
  const setPendingEditorReveal = useAppStore((s) => s.setPendingEditorReveal)

  const searchState = useAppStore((s) =>
    activeWorktreeId ? s.fileSearchStateByWorktree[activeWorktreeId] : null
  )
  const fileSearchQuery = searchState?.query ?? ''
  const fileSearchCaseSensitive = searchState?.caseSensitive ?? false
  const fileSearchWholeWord = searchState?.wholeWord ?? false
  const fileSearchUseRegex = searchState?.useRegex ?? false
  const fileSearchIncludePattern = searchState?.includePattern ?? ''
  const fileSearchExcludePattern = searchState?.excludePattern ?? ''
  const fileSearchResults = searchState?.results ?? null
  const fileSearchLoading = searchState?.loading ?? false
  const fileSearchCollapsedFiles = searchState?.collapsedFiles ?? EMPTY_COLLAPSED_FILES
  const fileSearchSeedRequestId = searchState?.seedRequestId
  const fileSearchFocusRequestId = searchState?.focusRequestId

  const updateFileSearchState = useAppStore((s) => s.updateFileSearchState)
  const consumeFileSearchSeedRequest = useAppStore((s) => s.consumeFileSearchSeedRequest)
  const toggleFileSearchCollapsedFile = useAppStore((s) => s.toggleFileSearchCollapsedFile)
  const clearFileSearch = useAppStore((s) => s.clearFileSearch)

  const inputRef = useRef<HTMLInputElement>(null)
  const revealRafRef = useRef<number | null>(null)
  const revealInnerRafRef = useRef<number | null>(null)
  const seededInputSelectionRafRef = useRef<number | null>(null)
  const includeInputRef = useRef<HTMLInputElement>(null)
  const excludeInputRef = useRef<HTMLInputElement>(null)

  const updateActiveSearchState = useEventCallback(
    (updates: Partial<NonNullable<typeof searchState>>) => {
      if (!activeWorktreeId) {
        return
      }
      updateFileSearchState(activeWorktreeId, updates)
    }
  )

  const clearActiveSearch = () => {
    if (!activeWorktreeId) {
      return
    }
    clearFileSearch(activeWorktreeId)
  }

  const toggleActiveCollapsedFile = (filePath: string) => {
    if (!activeWorktreeId) {
      return
    }
    toggleFileSearchCollapsedFile(activeWorktreeId, filePath)
  }

  const worktreePath = activeWorktree?.path ?? null
  const { executeSearch, cancelPendingSearch } = useFileSearchRunner({
    activeWorktreeId,
    worktreePath,
    updateActiveSearchState
  })

  const cancelSeededInputSelectionFrame = useEventCallback(() => {
    if (seededInputSelectionRafRef.current !== null) {
      cancelAnimationFrame(seededInputSelectionRafRef.current)
      seededInputSelectionRafRef.current = null
    }
  })

  const scheduleSeededInputSelection = useEventCallback(() => {
    cancelSeededInputSelectionFrame()
    seededInputSelectionRafRef.current = requestAnimationFrame(() => {
      seededInputSelectionRafRef.current = null
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  })

  const focusQueryInput = useEventCallback(() => {
    inputRef.current?.focus()
  })

  useEffect(() => {
    return () => {
      cancelSeededInputSelectionFrame()
      cancelRevealFrame(revealRafRef)
      cancelRevealFrame(revealInnerRafRef)
    }
  }, [cancelSeededInputSelectionFrame])

  useEffect(() => {
    if (!worktreePath) {
      cancelPendingSearch()
      updateActiveSearchState({ results: null })
    }
  }, [worktreePath, cancelPendingSearch, updateActiveSearchState])

  const deferredSearchResults = useDeferredValue(fileSearchResults)
  const searchRows = (() =>
    buildSearchRows(
      fileSearchQuery.trim() && worktreePath ? deferredSearchResults : null,
      fileSearchCollapsedFiles
    ))()

  useEffect(() => {
    if (!activeWorktreeId || fileSearchSeedRequestId === undefined) {
      return
    }

    if (fileSearchQuery.trim()) {
      executeSearch(fileSearchQuery)
    }
    scheduleSeededInputSelection()
    consumeFileSearchSeedRequest(activeWorktreeId, fileSearchSeedRequestId)
  }, [
    activeWorktreeId,
    consumeFileSearchSeedRequest,
    executeSearch,
    fileSearchQuery,
    fileSearchSeedRequestId,
    scheduleSeededInputSelection
  ])

  useEffect(() => {
    if (!activeWorktreeId || fileSearchFocusRequestId === undefined) {
      return
    }
    inputRef.current?.focus()
  }, [activeWorktreeId, fileSearchFocusRequestId])

  const previousExplorerViewRef = useRef(explorerView)
  useEffect(() => {
    if (previousExplorerViewRef.current !== 'search' && explorerView === 'search') {
      focusQueryInput()
    }
    previousExplorerViewRef.current = explorerView
  }, [explorerView, focusQueryInput])

  const handleClearSearch = () => {
    cancelPendingSearch()
    clearActiveSearch()
  }

  const rerunSearch = () => {
    if (!activeWorktreeId) {
      return
    }
    const q = useAppStore.getState().fileSearchStateByWorktree[activeWorktreeId]?.query ?? ''
    if (q.trim()) {
      executeSearch(q)
    }
  }

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    updateActiveSearchState({ query: val })
    executeSearch(val)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) {
      return
    }
    if (e.key === 'Escape') {
      if (fileSearchQuery) {
        handleClearSearch()
      }
    }
    if (e.key === 'Enter') {
      executeSearch(fileSearchQuery)
    }
  }

  const handleMatchClick = (fileResult: SearchFileResult, match: SearchMatch, preview: boolean) => {
    if (!activeWorktreeId) {
      return
    }
    openMatchResult({
      activeWorktreeId,
      fileResult,
      match,
      openFile,
      preview,
      workspacePanelTabId,
      setPendingEditorReveal,
      revealRafRef,
      revealInnerRafRef
    })
  }

  const { queryRowProps, filtersProps } = useFileSearchToggles({
    inputRef,
    includeInputRef,
    excludeInputRef,
    query: fileSearchQuery,
    loading: fileSearchLoading,
    caseSensitive: fileSearchCaseSensitive,
    wholeWord: fileSearchWholeWord,
    useRegex: fileSearchUseRegex,
    includePattern: fileSearchIncludePattern,
    excludePattern: fileSearchExcludePattern,
    onQueryChange: handleQueryChange,
    onKeyDown: handleKeyDown,
    onClearSearch: handleClearSearch,
    updateActiveSearchState,
    rerunSearch
  })

  const resultsProps = (() => ({
    results: deferredSearchResults,
    hasCommittedResults: fileSearchResults !== null,
    query: fileSearchQuery,
    loading: fileSearchLoading,
    rows: searchRows,
    onToggleCollapsedFile: toggleActiveCollapsedFile,
    onMatchClick: handleMatchClick
  }))()

  return (() => ({
    activeWorktreeId,
    queryRowProps,
    filtersProps,
    resultsProps,
    focusQueryInput
  }))()
}
