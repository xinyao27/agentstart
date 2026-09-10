import { parseWorkspaceKey } from '@agentstart/protocol/workspace/identity'
import type { WorktreeMeta } from '@agentstart/protocol/worktree/model'
import type { StateCreator } from 'zustand'
import { readProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import { updateProjectCatalogWorktree } from '~renderer/project-catalog/worktree-cache'
import { getActiveSidebarWorkspaceId } from '~renderer/sidebar/active-workspace'
import { refreshOwnedWorktreeCatalog } from '~renderer/worktree/catalog-refresh'

import type { AppState } from '../../store/types'
import { isRuntimeSelectorNotFoundError } from './known-model'
import { persistWorktreeMeta } from './review-resolver'
import { settingsForWorktreeOwner } from './runtime-owner'
import type { WorktreeSlice } from './types'

export function createWorktreeMetaBatchActions(
  set: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[1]
): Pick<WorktreeSlice, 'updateWorktreesMeta' | 'setWorktreesPinnedAndReveal'> {
  return {
    updateWorktreesMeta: async (updatesByWorktreeId) => {
      if (updatesByWorktreeId.size === 0) {
        return
      }

      const catalogState = readProjectCatalogRuntimeState()
      let didUpdate = false
      for (const [worktreeId, updates] of updatesByWorktreeId) {
        didUpdate = updateProjectCatalogWorktree(worktreeId, updates) || didUpdate
      }
      if (didUpdate) {
        set((state) => ({ sortEpoch: state.sortEpoch + 1 }))
      }

      await Promise.all(
        Array.from(updatesByWorktreeId, async ([worktreeId, updates]) => {
          try {
            await persistWorktreeMeta(
              settingsForWorktreeOwner(catalogState, worktreeId),
              worktreeId,
              updates
            )
          } catch (err) {
            if (isRuntimeSelectorNotFoundError(err)) {
              void refreshOwnedWorktreeCatalog(readProjectCatalogRuntimeState(), worktreeId)
              return
            }
            console.error('Failed to update worktree meta:', err)
            void refreshOwnedWorktreeCatalog(readProjectCatalogRuntimeState(), worktreeId)
          }
        })
      )
    },
    setWorktreesPinnedAndReveal: (worktreeIds, isPinned) => {
      // Only follow a toggled row with the viewport when it's the focused
      // worktree; pinning/unpinning an unfocused card shouldn't yank the user's
      // scroll to a row they aren't looking at.
      const activeSidebarWorktreeId = getActiveSidebarWorkspaceId(
        get().activeWorkspaceKey,
        get().activeWorktreeId
      )
      // Skip worktrees already in the target state so a no-op toggle doesn't
      // scroll the viewport away from where the user is.
      const updates = new Map<string, Partial<WorktreeMeta>>()
      let didChange = false
      let revealWorktreeId: string | null = null
      for (const worktreeId of worktreeIds) {
        const current = get().getKnownWorktreeById(worktreeId)
        if (!current || current.isPinned === isPinned) {
          continue
        }
        didChange = true
        const workspaceScope = parseWorkspaceKey(worktreeId)
        if (workspaceScope?.type === 'folder') {
          void get().updateWorktreeMeta(worktreeId, { isPinned })
        } else {
          updates.set(worktreeId, { isPinned })
        }
        if (revealWorktreeId === null && worktreeId === activeSidebarWorktreeId) {
          revealWorktreeId = worktreeId
        }
      }
      if (!didChange) {
        return
      }
      // updateWorktreesMeta applies its store update synchronously (only the
      // persistence is async), so the reveal below resolves against a render
      // where the shortcut row already exists.
      void get().updateWorktreesMeta(updates)
      if (revealWorktreeId !== null) {
        get().revealWorktreeInSidebar(revealWorktreeId, { behavior: 'smooth', highlight: true })
      }
    }
  }
}
