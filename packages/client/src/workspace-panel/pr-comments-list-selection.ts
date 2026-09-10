import type { PRComment } from '@agentstart/protocol/hosted-review/review-types'
import { useEffect, useState } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'
import {
  getPRCommentGroupId,
  groupPRComments,
  type PRCommentGroup
} from '~renderer/source-control/pr-comment-groups'
import { isPRCommentGroupQueueableForAI } from '~renderer/workspace-panel/pr-comment-action-state'

export type PRCommentsListSelection = {
  isSelectingForAI: boolean
  selectedGroupIds: ReadonlySet<string>
  selectableGroups: PRCommentGroup[]
  selectableGroupsById: ReadonlyMap<string, PRCommentGroup>
  selectedGroups: PRCommentGroup[]
  addGroupToSelection: (groupId: string) => void
  clearSelection: () => void
  toggleGroupSelection: (groupId: string, checked: boolean) => void
}

export type PRCommentsListSelectionClearRequest = {
  contextKey: string
  token: number
}

type PRCommentsListSelectionState = {
  contextKey: string | undefined
  isSelectingForAI: boolean
  selectedGroupIds: Set<string>
}

const EMPTY_SELECTED_GROUP_IDS = new Set<string>()
// Why: queued selections need to survive sidebar remounts, but old PR
// contexts can disappear without another clear signal in a long renderer run.
const MAX_PERSISTED_PR_COMMENTS_LIST_SELECTIONS = 1024
const persistedSelectionByContextKey = new Map<
  string,
  { isSelectingForAI: boolean; selectedGroupIds: Set<string> }
>()

function trimPersistedSelectionContexts(): void {
  while (persistedSelectionByContextKey.size > MAX_PERSISTED_PR_COMMENTS_LIST_SELECTIONS) {
    const oldestContextKey = persistedSelectionByContextKey.keys().next().value
    if (oldestContextKey === undefined) {
      break
    }
    persistedSelectionByContextKey.delete(oldestContextKey)
  }
}

function persistSelectionState(state: PRCommentsListSelectionState): void {
  if (!state.contextKey) {
    return
  }
  if (state.selectedGroupIds.size === 0) {
    persistedSelectionByContextKey.delete(state.contextKey)
    return
  }
  persistedSelectionByContextKey.delete(state.contextKey)
  persistedSelectionByContextKey.set(state.contextKey, {
    isSelectingForAI: state.isSelectingForAI,
    selectedGroupIds: new Set(state.selectedGroupIds)
  })
  trimPersistedSelectionContexts()
}

function refreshPersistedSelectionContext(contextKey: string | undefined): void {
  if (!contextKey) {
    return
  }
  const persisted = persistedSelectionByContextKey.get(contextKey)
  if (!persisted) {
    return
  }
  persistedSelectionByContextKey.delete(contextKey)
  persistedSelectionByContextKey.set(contextKey, persisted)
}

function readSelectionState(contextKey: string | undefined): PRCommentsListSelectionState {
  const persisted = contextKey ? persistedSelectionByContextKey.get(contextKey) : undefined
  return {
    contextKey,
    isSelectingForAI: persisted?.isSelectingForAI ?? false,
    selectedGroupIds: new Set(persisted?.selectedGroupIds ?? [])
  }
}

export function clearPRCommentsListSelection(contextKey: string | undefined): void {
  if (contextKey) {
    persistedSelectionByContextKey.delete(contextKey)
  }
}

export function usePRCommentsListSelection(
  comments: PRComment[],
  selectionContextKey: string | undefined,
  clearRequest?: PRCommentsListSelectionClearRequest | null
): PRCommentsListSelection {
  const [lastClearRequest, setLastClearRequest] =
    useState<PRCommentsListSelectionClearRequest | null>(null)
  const [renderedSelectionState, setRenderedSelectionState] =
    useState<PRCommentsListSelectionState>(() => readSelectionState(selectionContextKey))
  const currentSelectionState =
    renderedSelectionState.contextKey === selectionContextKey
      ? renderedSelectionState
      : readSelectionState(selectionContextKey)
  const shouldHandleClearRequest = Boolean(
    clearRequest &&
    clearRequest.contextKey === selectionContextKey &&
    (clearRequest.contextKey !== lastClearRequest?.contextKey ||
      clearRequest.token !== lastClearRequest.token)
  )
  const clearedSelectionState: PRCommentsListSelectionState = {
    contextKey: selectionContextKey,
    isSelectingForAI: false,
    selectedGroupIds: new Set<string>()
  }
  const selectionState = shouldHandleClearRequest ? clearedSelectionState : currentSelectionState
  if (shouldHandleClearRequest && clearRequest) {
    setLastClearRequest(clearRequest)
    setRenderedSelectionState(clearedSelectionState)
  }
  const commitSelectionState = useEventCallback((next: PRCommentsListSelectionState): void => {
    persistSelectionState(next)
    setRenderedSelectionState(next)
  })

  useEffect(() => {
    // Why: render-time normalization stays local; persistence and LRU order
    // only follow state that React actually committed.
    persistSelectionState(renderedSelectionState)
    refreshPersistedSelectionContext(renderedSelectionState.contextKey)
  }, [renderedSelectionState])

  // Why: selectable groups come from the unfiltered list so switching the
  // audience filter doesn't silently drop already-selected comments.
  const canonicalGroups = (() => groupPRComments(comments))()
  const selectableGroups = (() => canonicalGroups.filter(isPRCommentGroupQueueableForAI))()
  const selectableGroupsById = (() => {
    const map = new Map<string, PRCommentGroup>()
    for (const group of selectableGroups) {
      map.set(getPRCommentGroupId(group), group)
    }
    return map
  })()
  const isCurrentSelectionContext = selectionState.contextKey === selectionContextKey
  const candidateSelectedGroupIds = isCurrentSelectionContext
    ? selectionState.selectedGroupIds
    : EMPTY_SELECTED_GROUP_IDS
  const selectedGroupIds = (() => {
    let pruned = false
    const next = new Set<string>()
    for (const groupId of candidateSelectedGroupIds) {
      if (selectableGroupsById.has(groupId)) {
        next.add(groupId)
      } else {
        pruned = true
      }
    }
    return pruned ? next : candidateSelectedGroupIds
  })()
  if (
    comments.length > 0 &&
    isCurrentSelectionContext &&
    selectedGroupIds !== candidateSelectedGroupIds
  ) {
    setRenderedSelectionState({
      contextKey: selectionContextKey,
      isSelectingForAI: selectionState.isSelectingForAI,
      selectedGroupIds: new Set(selectedGroupIds)
    })
  }

  const isSelectingForAI =
    isCurrentSelectionContext && selectionState.isSelectingForAI && selectableGroupsById.size > 0
  const selectedGroups = (() =>
    [...selectedGroupIds]
      .map((groupId) => selectableGroupsById.get(groupId))
      .filter((group): group is PRCommentGroup => group !== undefined))()

  const addGroupToSelection = (groupId: string): void => {
    if (!selectableGroupsById.has(groupId)) {
      return
    }
    const next = {
      contextKey: selectionContextKey,
      isSelectingForAI: true,
      selectedGroupIds: new Set([groupId])
    }
    commitSelectionState(next)
  }

  const clearSelection = (): void => {
    const next = {
      contextKey: selectionContextKey,
      isSelectingForAI: false,
      selectedGroupIds: new Set<string>()
    }
    commitSelectionState(next)
  }

  const toggleGroupSelection = (groupId: string, checked: boolean): void => {
    if (!selectableGroupsById.has(groupId)) {
      return
    }
    const current = readSelectionState(selectionContextKey)
    const base =
      current.contextKey === selectionContextKey
        ? current.selectedGroupIds
        : EMPTY_SELECTED_GROUP_IDS
    const next = new Set([...base].filter((id) => selectableGroupsById.has(id)))
    if (checked) {
      next.add(groupId)
    } else {
      next.delete(groupId)
    }
    commitSelectionState({
      contextKey: selectionContextKey,
      isSelectingForAI: true,
      selectedGroupIds: next
    })
  }

  return {
    isSelectingForAI,
    selectedGroupIds,
    selectableGroups,
    selectableGroupsById,
    selectedGroups,
    addGroupToSelection,
    clearSelection,
    toggleGroupSelection
  }
}
