import { folderWorkspaceKey, parseWorkspaceKey } from '@agentstart/protocol/workspace/identity'
import type { StateCreator } from 'zustand'

import type { AppState } from '../../store/types'
import type { WorktreeSlice } from './types'

type HydrationPurgeState = Pick<
  AppState,
  | 'detectedWorktreesByRepo'
  | 'folderWorkspaces'
  | 'hasHydratedWorktreePurge'
  | 'repos'
  | 'restoredRuntimeHostIdByWorkspaceSessionKey'
  | 'tabsByWorktree'
>

function collectHydratedWorktreePurgeIds(state: HydrationPurgeState): string[] | null {
  if (state.hasHydratedWorktreePurge) {
    return []
  }
  const detected = state.repos.map((repo) => state.detectedWorktreesByRepo[repo.id])
  if (
    detected.length === 0 ||
    detected.some((result) => !result?.authoritative) ||
    !detected.some((result) => result.worktrees.length > 0)
  ) {
    return null
  }

  const validIds = new Set<string>()
  for (const workspace of state.folderWorkspaces ?? []) {
    validIds.add(folderWorkspaceKey(workspace.id))
  }
  for (const key of Object.keys(state.restoredRuntimeHostIdByWorkspaceSessionKey ?? {})) {
    if (parseWorkspaceKey(key)?.type === 'folder') {
      validIds.add(key)
    }
  }
  for (const result of detected) {
    for (const worktree of result.worktrees) {
      validIds.add(worktree.id)
    }
  }
  return Object.keys(state.tabsByWorktree).filter((id) => !validIds.has(id))
}

export function createWorktreeHydrationPurgeActions(
  set: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[1]
): Pick<WorktreeSlice, 'completeHydratedWorktreePurge'> {
  return {
    completeHydratedWorktreePurge: () => {
      const stale = collectHydratedWorktreePurgeIds(get())
      if (stale === null) {
        return
      }
      if (stale.length > 0) {
        console.warn(
          `[worktree-purge] hydration-time purge removing stale state for ${stale.length} worktree(s):`,
          stale
        )
        get().purgeWorktreeTerminalState(stale)
      }
      set({ hasHydratedWorktreePurge: true })
    }
  }
}
