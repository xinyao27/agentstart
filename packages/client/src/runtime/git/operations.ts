import type {
  GitAddTagResult,
  GitCheckoutCommitResult,
  GitCherryPickResult,
  GitCreateBranchResult,
  GitDropCommitResult,
  GitMergeCommitResult,
  GitRebaseOntoCommitResult,
  GitResetToCommitResult,
  GitRevertResult
} from '@agentstart/protocol/git/write-results'

import { openRuntimeGitClient } from './client'
import { getRuntimeGitWorktree, type RuntimeGitContext } from './context'

export async function abortRuntimeGitMerge(context: RuntimeGitContext): Promise<void> {
  const client = await openRuntimeGitClient(context)
  await client.abortMerge({ worktree: getRuntimeGitWorktree(context) }, { timeoutMs: 30_000 })
}

export async function abortRuntimeGitRebase(context: RuntimeGitContext): Promise<void> {
  const client = await openRuntimeGitClient(context)
  await client.abortRebase({ worktree: getRuntimeGitWorktree(context) }, { timeoutMs: 30_000 })
}

export async function addRuntimeGitTag(
  context: RuntimeGitContext,
  args: { name: string; commit: string; message?: string; force?: boolean }
): Promise<GitAddTagResult> {
  const client = await openRuntimeGitClient(context)
  return client.addTag({ worktree: getRuntimeGitWorktree(context), ...args }, { timeoutMs: 30_000 })
}

export async function createRuntimeGitBranchFromCommit(
  context: RuntimeGitContext,
  args: { name: string; commit: string; checkout?: boolean }
): Promise<GitCreateBranchResult> {
  const client = await openRuntimeGitClient(context)
  return client.createBranch(
    { worktree: getRuntimeGitWorktree(context), ...args },
    { timeoutMs: 30_000 }
  )
}

export async function checkoutRuntimeGitCommit(
  context: RuntimeGitContext,
  commit: string
): Promise<GitCheckoutCommitResult> {
  const client = await openRuntimeGitClient(context)
  return client.checkoutCommit(
    { worktree: getRuntimeGitWorktree(context), commit },
    { timeoutMs: 30_000 }
  )
}

export async function cherryPickRuntimeGitCommit(
  context: RuntimeGitContext,
  args: { commit: string; mainline?: number }
): Promise<GitCherryPickResult> {
  const client = await openRuntimeGitClient(context)
  return client.cherryPick(
    { worktree: getRuntimeGitWorktree(context), ...args },
    { timeoutMs: 60_000 }
  )
}

export async function revertRuntimeGitCommit(
  context: RuntimeGitContext,
  args: { commit: string; mainline?: number }
): Promise<GitRevertResult> {
  const client = await openRuntimeGitClient(context)
  return client.revertCommit(
    { worktree: getRuntimeGitWorktree(context), ...args },
    { timeoutMs: 60_000 }
  )
}

export async function dropRuntimeGitCommit(
  context: RuntimeGitContext,
  commit: string
): Promise<GitDropCommitResult> {
  const client = await openRuntimeGitClient(context)
  return client.dropCommit(
    { worktree: getRuntimeGitWorktree(context), commit },
    { timeoutMs: 60_000 }
  )
}

export async function mergeRuntimeGitCommit(
  context: RuntimeGitContext,
  args: { commit: string; noFf?: boolean; squash?: boolean; message?: string }
): Promise<GitMergeCommitResult> {
  const client = await openRuntimeGitClient(context)
  return client.mergeCommit(
    { worktree: getRuntimeGitWorktree(context), ...args },
    { timeoutMs: 60_000 }
  )
}

export async function rebaseRuntimeGitOntoCommit(
  context: RuntimeGitContext,
  commit: string
): Promise<GitRebaseOntoCommitResult> {
  const client = await openRuntimeGitClient(context)
  return client.rebaseOntoCommit(
    { worktree: getRuntimeGitWorktree(context), commit },
    { timeoutMs: 60_000 }
  )
}

export async function resetRuntimeGitToCommit(
  context: RuntimeGitContext,
  args: { commit: string; mode: 'soft' | 'mixed' | 'hard' }
): Promise<GitResetToCommitResult> {
  const client = await openRuntimeGitClient(context)
  return client.resetToCommit(
    { worktree: getRuntimeGitWorktree(context), ...args },
    { timeoutMs: 30_000 }
  )
}
