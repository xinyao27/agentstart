import type { WorktreeSetPatch } from '@yiru/protocol'
import type { GitPushTarget } from '@yiru/protocol/git/worktree-source'
import { isPositiveHostedReviewNumber } from '@yiru/protocol/hosted-review/types'
import type { Worktree, WorktreeMeta } from '@yiru/protocol/worktree/model'
import { readWorktreeMutationRevision } from '~renderer/project-catalog/catalog-snapshot'
import { refreshAfterWorktreeMutation } from '~renderer/project-catalog/mutation-refresh'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import {
  resolveRuntimeWorktreePrBase,
  setRuntimeWorktree
} from '~renderer/runtime/worktree-lifecycle-target'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'

import type { AppState } from '../../store/types'
import { encodePushTargetClearForRuntimeRpc } from './review-state'
import { getRepoIdFromWorktreeId } from './types'

export async function persistWorktreeMeta(
  settings: AppState['settings'],
  worktreeId: string,
  updates: Partial<WorktreeMeta>
): Promise<void> {
  const target = getActiveRuntimeTarget(settings)
  const repoId = getRepoIdFromWorktreeId(worktreeId)
  const expectedRevision = readWorktreeMutationRevision(target, repoId)
  // Why: `WorktreeMeta` (workbench domain model) and `WorktreeSetPatch`
  // (protobuf wire patch) describe the same patchable field set one-for-one.
  const result = await setRuntimeWorktree(target, {
    expectedRevision,
    worktree: toRuntimeWorktreeSelector(worktreeId),
    patch: encodePushTargetClearForRuntimeRpc(updates) as WorktreeSetPatch
  })
  await refreshAfterWorktreeMutation(target, repoId, result.revision)
}

export async function resolveGitHubReviewPushTarget(
  settings: AppState['settings'],
  repoId: string,
  prNumber: number
): Promise<GitPushTarget | undefined> {
  try {
    const target = getActiveRuntimeTarget(settings)
    const result = await resolveRuntimeWorktreePrBase(target, { repo: repoId, prNumber })
    if ('error' in result) {
      console.warn(`Failed to resolve push target for PR #${prNumber}: ${result.error}`)
      return undefined
    }
    return result.pushTarget
  } catch (error) {
    console.warn(
      `Failed to resolve push target for PR #${prNumber}:`,
      error instanceof Error ? error.message : error
    )
    return undefined
  }
}

export function getHostedReviewPushTargetLookup(worktree: Worktree): {
  key: string
  resolve: (settings: AppState['settings']) => Promise<GitPushTarget | undefined>
} | null {
  const hostScope = worktree.hostId ?? ''
  if (isPositiveHostedReviewNumber(worktree.linkedPR)) {
    const prNumber = worktree.linkedPR
    return {
      key: `${worktree.id}:${hostScope}:github:${prNumber}`,
      resolve: (settings) => resolveGitHubReviewPushTarget(settings, worktree.repoId, prNumber)
    }
  }
  return null
}
