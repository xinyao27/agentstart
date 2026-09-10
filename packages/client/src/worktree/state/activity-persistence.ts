import { RuntimeProtocolError, StatusCode, type WorktreeSetPatch } from '@agentstart/protocol'
import { readWorktreeMutationRevision } from '~renderer/project-catalog/catalog-snapshot'
import { refreshAfterWorktreeMutation } from '~renderer/project-catalog/mutation-refresh'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import {
  detectedListRuntimeWorktrees,
  setRuntimeWorktree
} from '~renderer/runtime/worktree-lifecycle-target'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'

import type { AppState } from '../../store/types'
import { getRepoIdFromWorktreeId } from './types'

const ACTIVITY_PERSIST_ATTEMPTS = 3

type WorktreeActivityPatch = Pick<WorktreeSetPatch, 'isUnread' | 'lastActivityAt'>

export async function persistWorktreeActivity(
  settings: AppState['settings'],
  worktreeId: string,
  patch: Partial<WorktreeActivityPatch>
): Promise<void> {
  const target = getActiveRuntimeTarget(settings)
  const repoId = getRepoIdFromWorktreeId(worktreeId)
  let expectedRevision = readWorktreeMutationRevision(target, repoId)

  for (let attempt = 0; attempt < ACTIVITY_PERSIST_ATTEMPTS; attempt += 1) {
    try {
      const result = await setRuntimeWorktree(target, {
        expectedRevision,
        worktree: toRuntimeWorktreeSelector(worktreeId),
        patch
      })
      await refreshAfterWorktreeMutation(target, repoId, result.revision)
      return
    } catch (error) {
      if (!isWorktreeRevisionConflict(error) || attempt === ACTIVITY_PERSIST_ATTEMPTS - 1) {
        throw error
      }
      // Why: activity fields are an atomic narrow patch. Re-reading the owning repo revision
      // preserves concurrent metadata fields while allowing this later activity event to land.
      const latest = await detectedListRuntimeWorktrees(target, { repo: repoId })
      if (latest.revision === undefined) {
        throw error
      }
      expectedRevision = latest.revision
    }
  }
}

function isWorktreeRevisionConflict(error: unknown): boolean {
  return (
    error instanceof RuntimeProtocolError &&
    error.code === StatusCode.ABORTED &&
    error.message === 'workspaceRevisionConflict'
  )
}
