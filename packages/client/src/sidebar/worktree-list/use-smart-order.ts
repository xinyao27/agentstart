import type { Repo } from '@yiru/protocol/project/repository'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useNow } from '~renderer/dashboard/use-now'
import { getAllWorktreesFromState, useAllWorktrees } from '~renderer/store/selectors'
import { useAppStore } from '~renderer/store/state'
import type { AppState } from '~renderer/store/types'
import { tabHasLivePty } from '~renderer/tab-bar/has-live-pty'
import { track } from '~renderer/telemetry/client'

import {
  buildAttentionByWorktree,
  hasFreshAttributedAgentStatus,
  type SmartClass,
  type WorktreeAttention
} from '../smart-attention'
import { buildWorktreeComparator, compareWorktreeSortLabel } from '../smart-sort'
import { persistWorktreeSortOrderByHost } from '../worktree-sort-order-persistence'

const SORT_SETTLE_MS = 3_000

type SortEpochStore = {
  value: number
  timer: number | null
  listeners: Set<() => void>
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => number
}

function createSortEpochStore(initialValue: number): SortEpochStore {
  const listeners = new Set<() => void>()
  const store: SortEpochStore = {
    value: initialValue,
    timer: null,
    listeners,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => store.value
  }
  return store
}

function updateSortEpochStore(store: SortEpochStore, nextValue: number, immediate: boolean): void {
  if (store.timer !== null) {
    window.clearTimeout(store.timer)
    store.timer = null
  }
  if (store.value === nextValue) {
    return
  }
  const commit = () => {
    store.timer = null
    store.value = nextValue
    for (const listener of store.listeners) {
      listener()
    }
  }
  if (immediate) {
    commit()
    return
  }
  store.timer = window.setTimeout(commit, SORT_SETTLE_MS)
}

export function useSmartWorktreeOrder(
  repoMap: Map<string, Repo>,
  sortBy: AppState['sortBy']
): string[] {
  const allWorktrees = useAllWorktrees()
  const sortEpoch = useAppStore((state) => state.sortEpoch)
  const worktreeCount = allWorktrees.reduce(
    (count, worktree) => count + (worktree.isArchived ? 0 : 1),
    0
  )
  const [sortEpochStore] = useState(() => createSortEpochStore(sortEpoch))
  const previousWorktreeCountRef = useRef(worktreeCount)

  useEffect(() => {
    const structuralChange = worktreeCount !== previousWorktreeCountRef.current
    previousWorktreeCountRef.current = worktreeCount
    // Why: structural changes and direct manipulation must repaint immediately;
    // activity-only score churn settles so it cannot move a card mid-interaction.
    updateSortEpochStore(sortEpochStore, sortEpoch, structuralChange || sortBy === 'manual')
  }, [sortBy, sortEpoch, sortEpochStore, worktreeCount])
  useEffect(
    () => () => {
      if (sortEpochStore.timer !== null) {
        window.clearTimeout(sortEpochStore.timer)
      }
    },
    [sortEpochStore]
  )
  const debouncedSortEpoch = useSyncExternalStore(
    sortEpochStore.subscribe,
    sortEpochStore.getSnapshot
  )
  const now = useNow(SORT_SETTLE_MS)
  void debouncedSortEpoch
  const state = useAppStore.getState()
  const nonArchivedWorktrees = getAllWorktreesFromState(state).filter(
    (worktree) => !worktree.isArchived
  )
  const hasAnyLivePty = Object.values(state.tabsByWorktree)
    .flat()
    .some((tab) => tabHasLivePty(state.ptyIdsByTabId, tab.id))
  const hasLiveSmartSignal =
    hasAnyLivePty ||
    hasFreshAttributedAgentStatus(state.agentStatusByPaneKey, now, state.tabsByWorktree)
  const usesPersistedColdStartOrder = sortBy === 'smart' && !hasLiveSmartSignal
  let attentionByWorktree: Map<string, WorktreeAttention> | null = null

  if (usesPersistedColdStartOrder) {
    // Why: hook-server state hydrates after launch. Persisted order prevents
    // every workspace collapsing to the comparator fallback during that gap.
    nonArchivedWorktrees.sort(
      (left, right) => right.sortOrder - left.sortOrder || compareWorktreeSortLabel(left, right)
    )
  } else {
    attentionByWorktree =
      sortBy === 'smart'
        ? buildAttentionByWorktree(
            nonArchivedWorktrees,
            state.tabsByWorktree,
            state.agentStatusByPaneKey,
            state.runtimePaneTitlesByTabId,
            state.ptyIdsByTabId,
            now,
            state.migrationUnsupportedByPtyId,
            state.terminalLayoutsByTabId
          )
        : new Map<string, WorktreeAttention>()
    nonArchivedWorktrees.sort(buildWorktreeComparator(sortBy, repoMap, now, attentionByWorktree))
  }
  const sortedIds = nonArchivedWorktrees.map((worktree) => worktree.id)

  useSmartOrderTelemetry(sortBy, sortedIds, attentionByWorktree)

  useEffect(() => {
    if (sortBy !== 'smart' || sortedIds.length === 0 || !hasLiveSmartSignal) {
      return
    }
    // Why: sortOrder is host-owned state, so each host persists only its ids.
    persistWorktreeSortOrderByHost(useAppStore.getState(), sortedIds)
  }, [hasLiveSmartSignal, sortBy, sortedIds])

  return sortedIds
}

function useSmartOrderTelemetry(
  sortBy: AppState['sortBy'],
  sortedIds: readonly string[],
  attention: Map<string, WorktreeAttention> | null
): void {
  const previousClassByWorktreeIdRef = useRef<Map<string, SmartClass>>(new Map())
  const hasObservedSmartOnceRef = useRef(false)
  useEffect(() => {
    if (sortBy !== 'smart' || !attention) {
      previousClassByWorktreeIdRef.current = new Map()
      hasObservedSmartOnceRef.current = false
      return
    }
    const next = new Map<string, SmartClass>()
    const isFirstObservation = !hasObservedSmartOnceRef.current
    for (const [worktreeId, info] of attention) {
      const previous = previousClassByWorktreeIdRef.current.get(worktreeId)
      if (!isFirstObservation && info.cls === 1 && previous !== 1 && info.cause) {
        track('smart_sort_class_1_promotion', { cause: info.cause })
      }
      next.set(worktreeId, info.cls)
    }
    previousClassByWorktreeIdRef.current = next
    hasObservedSmartOnceRef.current = true
  }, [attention, sortBy, sortedIds])

  const hasTrackedDistributionRef = useRef(false)
  useEffect(() => {
    if (sortBy !== 'smart') {
      hasTrackedDistributionRef.current = false
      return
    }
    if (hasTrackedDistributionRef.current) {
      return
    }
    if (!attention || attention.size === 0) {
      return
    }
    const counts = { class_1: 0, class_2: 0, class_3: 0, class_4: 0 }
    for (const info of attention.values()) {
      if (info.cls === 1) {
        counts.class_1++
      } else if (info.cls === 2) {
        counts.class_2++
      } else if (info.cls === 3) {
        counts.class_3++
      } else {
        counts.class_4++
      }
    }
    track('smart_sort_class_distribution', {
      ...counts,
      total_worktrees: attention.size
    })
    hasTrackedDistributionRef.current = true
  }, [attention, sortBy, sortedIds])

  const previousSortByRef = useRef(sortBy)
  useEffect(() => {
    const previous = previousSortByRef.current
    previousSortByRef.current = sortBy
    if (previous === 'smart' && sortBy === 'recent') {
      track('smart_to_recent_switch', {})
    }
  }, [sortBy])
}
