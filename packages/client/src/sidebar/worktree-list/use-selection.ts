import type { Worktree } from '@yiru/protocol/worktree/model'
import { useEffect, useState } from 'react'

import {
  areWorktreeSelectionsEqual,
  getWorktreeSelectionIntent,
  pruneWorktreeSelection,
  updateWorktreeSelection
} from '../worktree-multi-selection'

export function useWorktreeSelection(
  renderedWorktrees: readonly Worktree[],
  renderedWorktreeIds: readonly string[]
) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const pruned = pruneWorktreeSelection(selectedIds, anchorId, renderedWorktreeIds)
  // Why: filters can hide selected cards; child rows must never receive stale ids.
  if (!areWorktreeSelectionsEqual(selectedIds, pruned.selectedIds)) {
    setSelectedIds(pruned.selectedIds)
  }
  if (anchorId !== pruned.anchorId) {
    setAnchorId(pruned.anchorId)
  }
  const selectedWorktrees = (() => {
    const selected = new Map<string, Worktree>()
    for (const worktree of renderedWorktrees) {
      if (selectedIds.has(worktree.id)) {
        selected.set(worktree.id, worktree)
      }
    }
    return Array.from(selected.values())
  })()
  useEffect(() => {
    if (selectedIds.size === 0) {
      return
    }
    const clearOutsideSidebar = (event: PointerEvent): void => {
      const target = event.target
      const sidebar = document.querySelector('[data-worktree-sidebar-container]')
      if (target instanceof Node && sidebar?.contains(target)) {
        return
      }
      setSelectedIds(new Set())
      setAnchorId(null)
    }
    document.addEventListener('pointerdown', clearOutsideSidebar, { capture: true })
    return () => document.removeEventListener('pointerdown', clearOutsideSidebar, { capture: true })
  }, [selectedIds.size])
  const onSelectionGesture = (
    event: React.MouseEvent<HTMLElement>,
    worktreeId: string
  ): boolean => {
    const intent = getWorktreeSelectionIntent(event, navigator.userAgent.includes('Mac'))
    const result = updateWorktreeSelection({
      visibleIds: renderedWorktreeIds,
      previousSelectedIds: selectedIds,
      previousAnchorId: anchorId,
      targetId: worktreeId,
      intent
    })
    setSelectedIds(result.selectedIds)
    setAnchorId(result.anchorId)
    return intent !== 'replace'
  }
  const onContextMenuSelect = (
    _event: React.MouseEvent<HTMLElement>,
    worktree: Worktree
  ): readonly Worktree[] => {
    if (selectedIds.has(worktree.id) && selectedIds.size > 1) {
      return selectedWorktrees
    }
    // Why: a context menu scopes to its card without leaving a false selection ring.
    setAnchorId(worktree.id)
    return [worktree]
  }
  return { selectedIds, selectedWorktrees, onSelectionGesture, onContextMenuSelect }
}
