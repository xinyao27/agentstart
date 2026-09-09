import type { WorktreeSetPatch } from '@yiru/protocol'
import { readWorktreeMutationRevision } from '~renderer/project-catalog/catalog-snapshot'
import { refreshAfterWorktreeMutation } from '~renderer/project-catalog/mutation-refresh'
import { readProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import { readProjectCatalogWorktree } from '~renderer/project-catalog/worktree-cache'
import { getActiveRuntimeTarget, settingsForRuntimeOwner } from '~renderer/runtime/rpc-client'
import { setRuntimeWorktree } from '~renderer/runtime/worktree-lifecycle-target'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'
import { getRepoIdFromWorktreeId } from '~renderer/worktree/state/types'

import { normalizeDiffComment } from './comment-model'

const persistQueueByWorktree = new Map<string, Promise<void>>()

async function persistLatestComments(worktreeId: string): Promise<void> {
  const repoId = getRepoIdFromWorktreeId(worktreeId)
  const targetWorktree = readProjectCatalogWorktree(worktreeId)
  const diffComments = (targetWorktree?.diffComments ?? []).map(normalizeDiffComment)
  const state = readProjectCatalogRuntimeState()
  const settings = settingsForRuntimeOwner(
    state.settings,
    getRuntimeEnvironmentIdForWorktree(state, worktreeId)
  )
  const target = getActiveRuntimeTarget(settings)
  const expectedRevision = readWorktreeMutationRevision(target, repoId)
  // Why: `diffComments` is workbench-shaped one-for-one with the protobuf
  // patch's own `WorktreeDiffComment[]`; only the field name is shared here.
  const result = await setRuntimeWorktree(target, {
    expectedRevision,
    worktree: toRuntimeWorktreeSelector(worktreeId),
    patch: { diffComments } as WorktreeSetPatch
  })
  await refreshAfterWorktreeMutation(target, repoId, result.revision)
}

export function enqueueDiffCommentPersistence(worktreeId: string): Promise<void> {
  // Why: serialize per worktree and read Query only when dequeued so older RPC writes
  // cannot overwrite newer snapshots and bursts collapse to the latest state.
  const prior = persistQueueByWorktree.get(worktreeId) ?? Promise.resolve()
  const run = (): Promise<void> => persistLatestComments(worktreeId)
  const next = prior.then(run, run)
  persistQueueByWorktree.set(worktreeId, next)
  const cleanup = (): void => {
    if (persistQueueByWorktree.get(worktreeId) === next) {
      persistQueueByWorktree.delete(worktreeId)
    }
  }
  // Why: two-handler then consumes rejection while preserving the caller's own promise.
  next.then(cleanup, cleanup)
  return next
}
