import type { StateCreator } from 'zustand'
import { readProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import { updateProjectCatalogWorktree } from '~renderer/project-catalog/worktree-cache'
import { branchName } from '~renderer/source-control/branch-name'
import { refreshOwnedWorktreeCatalog } from '~renderer/worktree/catalog-refresh'

import { refreshHostedReviewCard } from '../../source-control/hosted-review-state/slice'
import type { AppState } from '../../store/types'
import { persistWorktreeActivity } from './activity-persistence'
import { reconcileHydratedWorktreeReferences } from './hydration-reconciliation'
import { findKnownWorktreeById, isRuntimeSelectorNotFoundError } from './known-model'
import { settingsForWorktreeOwner } from './runtime-owner'
import type { WorktreeSlice } from './types'

export function createWorktreeActivityActions(
  set: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[1]
): Pick<
  WorktreeSlice,
  | 'markWorktreeUnread'
  | 'observeTerminalGitHubPullRequestLink'
  | 'clearWorktreeUnread'
  | 'bumpWorktreeActivity'
  | 'markWorktreeVisited'
  | 'pruneLastVisitedTimestamps'
  | 'seedActiveWorktreeLastVisitedIfMissing'
> {
  return {
    markWorktreeUnread: (worktreeId) => {
      // Why: terminal attention should remain visible until the user engages
      // with the worktree. Interaction with a pane inside the worktree dismisses
      // the dot via clearWorktreeUnread. Worktree activation via setActiveWorktree
      // also clears isUnread as a side-effect; that path predates this PR and is
      // unaffected here.
      const now = Date.now()
      const state = readProjectCatalogRuntimeState()
      const worktree = findKnownWorktreeById(state, worktreeId)
      if (!worktree || worktree.isUnread) {
        return
      }
      updateProjectCatalogWorktree(worktreeId, { isUnread: true, lastActivityAt: now })
      set((current) => ({ sortEpoch: current.sortEpoch + 1 }))

      void persistWorktreeActivity(settingsForWorktreeOwner(state, worktreeId), worktreeId, {
        isUnread: true,
        lastActivityAt: now
      }).catch((err) => {
        if (isRuntimeSelectorNotFoundError(err)) {
          void refreshOwnedWorktreeCatalog(readProjectCatalogRuntimeState(), worktreeId)
          return
        }
        console.error('Failed to persist unread worktree state:', err)
        void refreshOwnedWorktreeCatalog(readProjectCatalogRuntimeState(), worktreeId)
      })
    },
    observeTerminalGitHubPullRequestLink: (worktreeId, link) => {
      const state = readProjectCatalogRuntimeState()
      const worktree = findKnownWorktreeById(state, worktreeId)
      if (!worktree || worktree.isBare || worktree.isArchived) {
        return
      }
      const repo = state.repos.find((candidate) => candidate.id === worktree.repoId)
      if (!repo || (repo.kind && repo.kind !== 'git')) {
        return
      }
      if (typeof worktree.linkedPR === 'number' && worktree.linkedPR !== link.number) {
        return
      }

      const branch = branchName(worktree.branch)
      const alreadyLinked = worktree.linkedPR === link.number

      const fetchPRForBranch = get().fetchPRForBranch
      if (typeof fetchPRForBranch === 'function') {
        void fetchPRForBranch(repo.path, branch, {
          force: true,
          repoId: repo.id,
          worktreeId,
          linkedPRNumber: alreadyLinked ? link.number : null,
          fallbackPRNumber: null,
          fallbackPRSource: alreadyLinked ? null : 'explicit'
        }).then((pr) => {
          if (!alreadyLinked && pr?.number === link.number) {
            // Why: terminal output can include arbitrary PR URLs from docs,
            // agents, or logs. Persist only after branch lookup confirms it and
            // the user has not picked a different PR while lookup was in flight.
            void get().updateWorktreeMeta(
              worktreeId,
              { linkedPR: link.number },
              {
                shouldApply: (currentWorktree) =>
                  Boolean(
                    currentWorktree &&
                    !currentWorktree.isBare &&
                    !currentWorktree.isArchived &&
                    (currentWorktree.linkedPR == null || currentWorktree.linkedPR === link.number)
                  )
              }
            )
          }
        })
        return
      }

      const fetchHostedReviewForBranch = get().fetchHostedReviewForBranch
      if (typeof fetchHostedReviewForBranch === 'function') {
        // Why: full app stores always have fetchPRForBranch, which syncs the
        // GitHub hosted-review cache. Keep this only as a slice-test fallback.
        void refreshHostedReviewCard(fetchHostedReviewForBranch, {
          repoPath: repo.path,
          repoId: repo.id,
          branch,
          linkedGitHubPR: alreadyLinked ? link.number : null,
          fallbackGitHubPR: null
        })
      }
    },
    clearWorktreeUnread: (worktreeId) => {
      const state = readProjectCatalogRuntimeState()
      const worktree = findKnownWorktreeById(state, worktreeId)
      if (!worktree || !worktree.isUnread) {
        return
      }
      updateProjectCatalogWorktree(worktreeId, { isUnread: false })

      void persistWorktreeActivity(settingsForWorktreeOwner(state, worktreeId), worktreeId, {
        isUnread: false
      }).catch((err) => {
        if (isRuntimeSelectorNotFoundError(err)) {
          void refreshOwnedWorktreeCatalog(readProjectCatalogRuntimeState(), worktreeId)
          return
        }
        console.error('Failed to persist cleared unread worktree state:', err)
        void refreshOwnedWorktreeCatalog(readProjectCatalogRuntimeState(), worktreeId)
      })
    },
    bumpWorktreeActivity: (worktreeId) => {
      const now = Date.now()
      const state = readProjectCatalogRuntimeState()
      const worktree = findKnownWorktreeById(state, worktreeId)
      if (!worktree) {
        return
      }
      updateProjectCatalogWorktree(worktreeId, { lastActivityAt: now })
      set((s) => {
        // Skip sortEpoch bump for the active worktree. Terminal events
        // (PTY spawn, PTY exit) in the active worktree are side-effects of
        // the user clicking the card or interacting with the terminal —
        // re-sorting the sidebar in response would cause the exact reorder-
        // on-click bug PR #209 intended to fix (e.g. dead-PTY reconnection
        // after generation bump triggers updateTabPtyId → here).
        // The lastActivityAt timestamp is still persisted so that the NEXT
        // meaningful sortEpoch bump (from a background worktree event) will
        // include this worktree's updated smart-sort score.
        const isActive = s.activeWorktreeId === worktreeId
        return isActive ? {} : { sortEpoch: s.sortEpoch + 1 }
      })

      void persistWorktreeActivity(settingsForWorktreeOwner(state, worktreeId), worktreeId, {
        lastActivityAt: now
      }).catch((err) => {
        if (isRuntimeSelectorNotFoundError(err)) {
          return
        }
        console.error('Failed to persist worktree activity timestamp:', err)
        void refreshOwnedWorktreeCatalog(readProjectCatalogRuntimeState(), worktreeId)
      })
    },
    markWorktreeVisited: (worktreeId, visitedAt) => {
      // Why: Command Palette ordering needs a focus-recency signal that is
      // distinct from worktree.lastActivityAt (which is driven by background
      // PTY/activity events). Monotonic: CLI- and IPC-driven activations can
      // race, so older timestamps must not regress the stored value. See
      // docs/cmd-j-empty-query-ordering.md.
      set((s) => {
        const now = visitedAt ?? Date.now()
        const prev = s.lastVisitedAtByWorktreeId[worktreeId] ?? 0
        if (!(now > prev)) {
          return {}
        }
        return {
          lastVisitedAtByWorktreeId: {
            ...s.lastVisitedAtByWorktreeId,
            [worktreeId]: now
          }
        }
      })
    },
    pruneLastVisitedTimestamps: () => {
      const catalogState = readProjectCatalogRuntimeState()
      set((s) => {
        return reconcileHydratedWorktreeReferences({
          worktreesByRepo: catalogState.worktreesByRepo,
          detectedWorktreesByRepo: catalogState.detectedWorktreesByRepo,
          lastVisitedAtByWorktreeId: s.lastVisitedAtByWorktreeId,
          activeWorktreeId: s.activeWorktreeId
        })
      })
    },
    seedActiveWorktreeLastVisitedIfMissing: () => {
      set((s) => {
        const id = s.activeWorktreeId
        if (!id) {
          return {}
        }
        if (s.lastVisitedAtByWorktreeId[id] != null) {
          return {}
        }
        return {
          lastVisitedAtByWorktreeId: {
            ...s.lastVisitedAtByWorktreeId,
            [id]: Date.now()
          }
        }
      })
    }
  }
}
