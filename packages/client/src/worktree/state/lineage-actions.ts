import type { Worktree } from '@agentstart/protocol/worktree/model'
import type { StateCreator } from 'zustand'
import { readProjectCatalogQueryClient } from '~renderer/project-catalog/catalog-snapshot'
import { refreshProjectCatalogLineage } from '~renderer/project-catalog/refresh'
import { readProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import { updateProjectCatalogWorktree } from '~renderer/project-catalog/worktree-cache'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { branchName } from '~renderer/source-control/branch-name'
import { refreshOwnedWorktreeCatalog } from '~renderer/worktree/catalog-refresh'

import type { AppState } from '../../store/types'
import { isRuntimeSelectorNotFoundError } from './known-model'
import { setWorktreeLineageForRuntime } from './lineage-model'
import { detachedHeadAutoDerivedDisplayNames } from './refresh-model'
import { persistWorktreeMeta } from './review-resolver'
import {
  CLEARED_HOSTED_REVIEW_LINK_UPDATES,
  hostedReviewLinkClearTombstonesByWorktreeId,
  hasBranchScopedHostedReviewContext,
  getHostedReviewLinkMutationGeneration,
  resolveHostedReviewLinkWorktreeId,
  hostedReviewLinksAreCleared,
  getHostedReviewLinkUpdates,
  canonicalHostedReviewBranchIdentity,
  rememberHostedReviewLinkClear,
  applyHostedReviewLinkClear
} from './review-state'
import { settingsForWorktreeOwner } from './runtime-owner'
import type { WorktreeSlice } from './types'

export function createWorktreeLineageActions(
  set: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[1]
): Pick<
  WorktreeSlice,
  | 'updateWorktreeLineage'
  | 'assignWorktreeParent'
  | 'updateWorktreeGitIdentity'
  | 'updateWorktreeBaseStatus'
> {
  return {
    updateWorktreeLineage: async (worktreeId, args) => {
      const ownerSettings = settingsForWorktreeOwner(readProjectCatalogRuntimeState(), worktreeId)
      try {
        await setWorktreeLineageForRuntime(ownerSettings, worktreeId, args)
      } catch (err) {
        console.error('Failed to update worktree lineage:', err)
        await refreshProjectCatalogLineage(
          readProjectCatalogQueryClient(),
          getActiveRuntimeTarget(ownerSettings)
        )
      }
    },
    assignWorktreeParent: async (worktreeId, args) => {
      const ownerSettings = settingsForWorktreeOwner(readProjectCatalogRuntimeState(), worktreeId)
      try {
        await setWorktreeLineageForRuntime(ownerSettings, worktreeId, args)
      } catch (err) {
        console.error('Failed to assign worktree parent:', err)
        await refreshProjectCatalogLineage(
          readProjectCatalogQueryClient(),
          getActiveRuntimeTarget(ownerSettings)
        )
        throw err
      }
    },
    updateWorktreeGitIdentity: (worktreeId, identity) => {
      let shouldPersistHostedReviewClear = false
      let clearedBranch: string | null = null
      let clearGeneration = getHostedReviewLinkMutationGeneration(worktreeId)
      const catalogState = readProjectCatalogRuntimeState()
      const existing = get().getKnownWorktreeById(worktreeId)
      if (!existing) {
        return
      }
      const expectedHead = identity.head ?? existing.head
      const expectedBranch = identity.branch === null ? '' : (identity.branch ?? existing.branch)
      if (expectedHead === existing.head && expectedBranch === existing.branch) {
        return
      }

      const hostedReviewBranchChanged =
        canonicalHostedReviewBranchIdentity(expectedBranch) !==
        canonicalHostedReviewBranchIdentity(existing.branch)
      const shouldClearHostedReviewContext =
        hostedReviewBranchChanged && hasBranchScopedHostedReviewContext(existing as Worktree)
      if (shouldClearHostedReviewContext) {
        shouldPersistHostedReviewClear = true
        clearedBranch = expectedBranch
        clearGeneration = getHostedReviewLinkMutationGeneration(worktreeId)
        rememberHostedReviewLinkClear(worktreeId, expectedBranch, clearGeneration, expectedHead)
      } else {
        const tombstone = hostedReviewLinkClearTombstonesByWorktreeId.get(worktreeId)
        if (tombstone) {
          hostedReviewLinkClearTombstonesByWorktreeId.set(worktreeId, {
            ...tombstone,
            branch: expectedBranch,
            branchIdentity: canonicalHostedReviewBranchIdentity(expectedBranch),
            head: expectedHead
          })
          if (hostedReviewBranchChanged) {
            shouldPersistHostedReviewClear = true
            clearedBranch = expectedBranch
            clearGeneration = tombstone.generation
          }
        }
      }
      const wasAutoDerived = existing.displayName === branchName(existing.branch)
      const wasDetachedAutoDerived =
        existing.branch === '' &&
        expectedBranch !== '' &&
        detachedHeadAutoDerivedDisplayNames.get(worktreeId) === existing.displayName
      const displayName =
        (wasAutoDerived || wasDetachedAutoDerived) && expectedBranch
          ? branchName(expectedBranch)
          : existing.displayName
      if (identity.branch === null && wasAutoDerived) {
        detachedHeadAutoDerivedDisplayNames.set(worktreeId, existing.displayName)
      } else if (identity.branch !== undefined) {
        detachedHeadAutoDerivedDisplayNames.delete(worktreeId)
      }
      updateProjectCatalogWorktree(worktreeId, {
        head: expectedHead,
        branch: expectedBranch,
        displayName,
        ...(shouldClearHostedReviewContext ? CLEARED_HOSTED_REVIEW_LINK_UPDATES : {})
      })
      set((state) => ({ sortEpoch: state.sortEpoch + 1 }))
      if (!shouldPersistHostedReviewClear || clearedBranch === null) {
        return
      }

      void Promise.resolve()
        .then(async () => {
          let currentWorktreeId = resolveHostedReviewLinkWorktreeId(worktreeId)
          const persistedWorktreeIds = new Set<string>()
          while (true) {
            currentWorktreeId = resolveHostedReviewLinkWorktreeId(currentWorktreeId)
            if (persistedWorktreeIds.has(currentWorktreeId)) {
              return
            }
            persistedWorktreeIds.add(currentWorktreeId)
            let current = get().getKnownWorktreeById(currentWorktreeId)
            if (
              !current ||
              current.branch !== clearedBranch ||
              getHostedReviewLinkMutationGeneration(currentWorktreeId) !== clearGeneration
            ) {
              return
            }
            if (!hostedReviewLinksAreCleared(current as Worktree)) {
              // Why: a worktree refetch can rehydrate stale linked-review metadata
              // before this async clear starts; clear it again instead of bailing out.
              applyHostedReviewLinkClear(currentWorktreeId)
              current = get().getKnownWorktreeById(currentWorktreeId)
              if (!current || current.branch !== clearedBranch) {
                return
              }
            }
            await persistWorktreeMeta(
              settingsForWorktreeOwner(catalogState, currentWorktreeId),
              currentWorktreeId,
              CLEARED_HOSTED_REVIEW_LINK_UPDATES
            )
            const migratedWorktreeId = resolveHostedReviewLinkWorktreeId(currentWorktreeId)
            if (migratedWorktreeId === currentWorktreeId) {
              break
            }
            // Why: worktree creation can migrate ids while this IPC is in flight;
            // persist the branch-scoped clear under the new durable id as well.
            currentWorktreeId = migratedWorktreeId
          }
          const latest = get().getKnownWorktreeById(currentWorktreeId)
          if (
            !latest ||
            latest.branch !== clearedBranch ||
            hostedReviewLinksAreCleared(latest as Worktree)
          ) {
            return
          }
          if (getHostedReviewLinkMutationGeneration(currentWorktreeId) !== clearGeneration) {
            // Why: a delayed branch-switch clear must not win over a newer manual relink.
            await persistWorktreeMeta(
              settingsForWorktreeOwner(readProjectCatalogRuntimeState(), currentWorktreeId),
              currentWorktreeId,
              getHostedReviewLinkUpdates(latest as Worktree)
            )
            return
          }
          // Why: a worktree refetch can briefly rehydrate old metadata before
          // the branch-switch clear reaches disk; do not write that stale link back.
          applyHostedReviewLinkClear(currentWorktreeId)
        })
        .catch((err) => {
          if (isRuntimeSelectorNotFoundError(err)) {
            void refreshOwnedWorktreeCatalog(
              readProjectCatalogRuntimeState(),
              resolveHostedReviewLinkWorktreeId(worktreeId)
            )
            return
          }
          console.error('Failed to persist branch-scoped review link clear:', err)
        })
    },
    updateWorktreeBaseStatus: (event) => {
      set((s) => ({
        baseStatusByWorktreeId: {
          ...s.baseStatusByWorktreeId,
          [event.worktreeId]: event
        }
      }))
    }
  }
}
