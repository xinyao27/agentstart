import type { StateCreator } from 'zustand'
import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import {
  forceDeleteRuntimeWorktreeBranch,
  getRuntimeWorktreeBranchRenameFailureOutput
} from '~renderer/runtime/worktree-lifecycle-target'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'

import type { AppState } from '../../store/types'
import { settingsForWorktreeOwner } from './runtime-owner'
import type { WorktreeSlice } from './types'

export function createWorktreeDeleteStateActions(
  set: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[1]
): Pick<
  WorktreeSlice,
  | 'markWorktreesDeleting'
  | 'markWorktreesQueuedForDeletion'
  | 'forceDeletePreservedBranch'
  | 'getWorktreeBranchRenameFailureOutput'
  | 'clearWorktreeDeleteState'
> {
  return {
    markWorktreesDeleting: (worktreeIds) => {
      if (worktreeIds.length === 0) {
        return
      }
      set((s) => {
        const nextDeleteState = { ...s.deleteStateByWorktreeId }
        let changed = false
        for (const worktreeId of new Set(worktreeIds)) {
          const current = nextDeleteState[worktreeId]
          if (current?.isDeleting && current.error === null && !current.canForceDelete) {
            continue
          }
          nextDeleteState[worktreeId] = {
            isDeleting: true,
            phase: 'deleting',
            error: null,
            canForceDelete: false,
            forceDeleteReason: null
          }
          changed = true
        }
        return changed ? { deleteStateByWorktreeId: nextDeleteState } : {}
      })
    },
    markWorktreesQueuedForDeletion: (worktreeIds) => {
      if (worktreeIds.length === 0) {
        return
      }
      set((s) => {
        const nextDeleteState = { ...s.deleteStateByWorktreeId }
        let changed = false
        for (const worktreeId of new Set(worktreeIds)) {
          const current = nextDeleteState[worktreeId]
          if (current?.isDeleting && current.error === null && !current.canForceDelete) {
            continue
          }
          nextDeleteState[worktreeId] = {
            isDeleting: true,
            phase: 'queued',
            error: null,
            canForceDelete: false,
            forceDeleteReason: null
          }
          changed = true
        }
        return changed ? { deleteStateByWorktreeId: nextDeleteState } : {}
      })
    },
    forceDeletePreservedBranch: async (worktreeId, branchName, expectedHead) => {
      try {
        const target = getActiveRuntimeTarget(settingsForWorktreeOwner(get(), worktreeId))
        const result = await forceDeleteRuntimeWorktreeBranch(target, {
          worktree: toRuntimeWorktreeSelector(worktreeId),
          branchName,
          expectedHead
        })
        publishRendererCommandResult({
          type: 'worktree-branch-delete',
          outcome: 'succeeded',
          branchName
        })
        return { ok: true as const, ...result }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        publishRendererCommandResult({
          type: 'worktree-branch-delete',
          outcome: 'failed',
          branchName,
          error
        })
        return { ok: false as const, error }
      }
    },
    getWorktreeBranchRenameFailureOutput: async (worktreeId) => {
      const target = getActiveRuntimeTarget(settingsForWorktreeOwner(get(), worktreeId))
      return getRuntimeWorktreeBranchRenameFailureOutput(target, {
        worktree: toRuntimeWorktreeSelector(worktreeId)
      })
    },
    clearWorktreeDeleteState: (worktreeId) => {
      set((s) => {
        if (!s.deleteStateByWorktreeId[worktreeId]) {
          return {}
        }
        const next = { ...s.deleteStateByWorktreeId }
        delete next[worktreeId]
        return { deleteStateByWorktreeId: next }
      })
    }
  }
}
