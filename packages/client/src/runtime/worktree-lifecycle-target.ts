import {
  WORKTREE_PROTOCOL_CAPABILITY,
  WorktreeClient,
  type WorktreeActivateInput,
  type WorktreeActivateResult,
  type WorktreeCreateInput,
  type WorktreeCreateResult,
  type WorktreeDetectedListResult,
  type WorktreeForceDeleteBranchInput,
  type WorktreeForceDeleteBranchResult,
  type WorktreeLineageListResult,
  type WorktreeListResult,
  type WorktreePersistSortOrderResult,
  type WorktreePrBaseResult,
  type WorktreePrefetchCreateBaseInput,
  type WorktreeRemoveInput,
  type WorktreeRemoveResult,
  type WorktreeResolvePrBaseInput,
  type WorktreeSetInput,
  type WorktreeShowResult
} from '@agentstart/protocol'

import { openRuntimeProtocolTarget } from './protocol-target'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

export async function listRuntimeWorktrees(
  target: RuntimeClientTarget,
  input: { repo?: string; limit?: number }
): Promise<WorktreeListResult> {
  return (await requireWorktreeClient(target)).list(input, { timeoutMs: 15_000 })
}

export async function createRuntimeWorktree(
  target: RuntimeClientTarget,
  input: WorktreeCreateInput,
  timeoutMs = 10 * 60_000
): Promise<WorktreeCreateResult> {
  return (await requireWorktreeClient(target)).create(input, { timeoutMs })
}

export async function activateRuntimeWorktree(
  target: RuntimeClientTarget,
  input: WorktreeActivateInput,
  timeoutMs = 15_000
): Promise<WorktreeActivateResult> {
  return (await requireWorktreeClient(target)).activate(input, { timeoutMs })
}

export async function sleepRuntimeWorktree(
  target: RuntimeClientTarget,
  worktree: string
): Promise<void> {
  await (await requireWorktreeClient(target)).sleep({ worktree }, { timeoutMs: 60_000 })
}

export async function detectedListRuntimeWorktrees(
  target: RuntimeClientTarget,
  input: { repo: string }
): Promise<WorktreeDetectedListResult> {
  return (await requireWorktreeClient(target)).detectedList(input, { timeoutMs: 15_000 })
}

export async function prefetchRuntimeWorktreeCreateBase(
  target: RuntimeClientTarget,
  input: WorktreePrefetchCreateBaseInput
): Promise<null> {
  return (await requireWorktreeClient(target)).prefetchCreateBase(input, { timeoutMs: 30_000 })
}

export async function resolveRuntimeWorktreePrBase(
  target: RuntimeClientTarget,
  input: WorktreeResolvePrBaseInput
): Promise<WorktreePrBaseResult> {
  return (await requireWorktreeClient(target)).resolvePrBase(input, { timeoutMs: 30_000 })
}

export async function removeRuntimeWorktree(
  target: RuntimeClientTarget,
  input: WorktreeRemoveInput,
  timeoutMs = 60_000
): Promise<WorktreeRemoveResult> {
  return (await requireWorktreeClient(target)).remove(input, { timeoutMs })
}

export async function forceDeleteRuntimeWorktreeBranch(
  target: RuntimeClientTarget,
  input: WorktreeForceDeleteBranchInput
): Promise<WorktreeForceDeleteBranchResult> {
  return (await requireWorktreeClient(target)).forceDeleteBranch(input, { timeoutMs: 15_000 })
}

export async function setRuntimeWorktree(
  target: RuntimeClientTarget,
  input: WorktreeSetInput
): Promise<WorktreeShowResult> {
  return (await requireWorktreeClient(target)).set(input, { timeoutMs: 15_000 })
}

export async function listRuntimeWorktreeLineage(
  target: RuntimeClientTarget
): Promise<WorktreeLineageListResult> {
  return (await requireWorktreeClient(target)).lineageList({ timeoutMs: 15_000 })
}

export async function persistRuntimeWorktreeSortOrder(
  target: RuntimeClientTarget,
  input: { orderedIds: string[] }
): Promise<WorktreePersistSortOrderResult> {
  return (await requireWorktreeClient(target)).persistSortOrder(input, { timeoutMs: 15_000 })
}

export async function getRuntimeWorktreeBranchRenameFailureOutput(
  target: RuntimeClientTarget,
  input: { worktree: string }
): Promise<string | null> {
  return (await requireWorktreeClient(target)).branchRenameFailureOutput(input, {
    timeoutMs: 15_000
  })
}

/**
 * Tail worktree base-drift signals for the target
 * host. The returned iterable ends when `signal` aborts or the connection
 * drops; callers that need retry/back-off wrap this in `createRuntimeStreamFanOut`.
 */
export async function subscribeRuntimeWorktreeStateEvents(
  target: RuntimeClientTarget,
  signal: AbortSignal
) {
  const client = await requireWorktreeClient(target)
  const subscription = await client.subscribeStateEvents({ signal })
  return subscription.messages
}

async function requireWorktreeClient(target: RuntimeClientTarget): Promise<WorktreeClient> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(WORKTREE_PROTOCOL_CAPABILITY)) {
    throw new Error('Runtime host does not advertise the worktree protobuf capability')
  }
  return new WorktreeClient(await openRuntimeProtocolTarget(target))
}
