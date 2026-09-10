import type { GitBranchCompareResult } from '@agentstart/protocol/git/branch-compare-types'
import type { GitCommitCompareResult } from '@agentstart/protocol/git/compare-values'
import type { GitDiffResult } from '@agentstart/protocol/git/diff-values'
import type { GitHistoryOptions, GitHistoryResult } from '@agentstart/protocol/git/history-types'
import type {
  GitConflictOperation,
  GitStagingArea,
  GitStatusResult
} from '@agentstart/protocol/git/status-types'

import { openRuntimeGitClient } from './client'
import { getRuntimeGitWorktree, type RuntimeGitContext } from './context'

export async function getRuntimeGitStatus(
  context: RuntimeGitContext,
  options?: {
    includeIgnored?: boolean
    bypassEffectiveUpstreamNegativeCache?: boolean
    reuseLineStats?: boolean
    signal?: AbortSignal
  }
): Promise<GitStatusResult> {
  const client = await openRuntimeGitClient(context)
  return client.status(
    {
      worktree: getRuntimeGitWorktree(context),
      includeIgnored: options?.includeIgnored,
      bypassNegativeCache: options?.bypassEffectiveUpstreamNegativeCache,
      reuseLineStats: options?.reuseLineStats
    },
    {
      timeoutMs: 15_000,
      // Why: the safety refresh is bounded by its timeout and guarded against
      // stale results, while active refreshes must cancel host-side Git work.
      ...(options?.reuseLineStats ? {} : { signal: options?.signal })
    }
  )
}

export async function getRuntimeGitSubmoduleStatus(
  context: RuntimeGitContext,
  submodulePath: string,
  area: GitStagingArea = 'unstaged'
): Promise<GitStatusResult> {
  const client = await openRuntimeGitClient(context)
  return client.submoduleStatus(
    { worktree: getRuntimeGitWorktree(context), submodulePath, area },
    { timeoutMs: 15_000 }
  )
}

export async function getRuntimeGitIgnoredPaths(
  context: RuntimeGitContext,
  paths: string[]
): Promise<string[]> {
  if (paths.length === 0) {
    return []
  }
  const client = await openRuntimeGitClient(context)
  return client.checkIgnored(
    { worktree: getRuntimeGitWorktree(context), paths },
    { timeoutMs: 15_000 }
  )
}

export async function getRuntimeGitHistory(
  context: RuntimeGitContext,
  options: GitHistoryOptions = {}
): Promise<GitHistoryResult> {
  const client = await openRuntimeGitClient(context)
  return client.history(
    { worktree: getRuntimeGitWorktree(context), ...options },
    { timeoutMs: 15_000 }
  )
}

export async function getRuntimeGitConflictOperation(
  context: RuntimeGitContext
): Promise<GitConflictOperation> {
  const client = await openRuntimeGitClient(context)
  return client.conflictOperation(
    { worktree: getRuntimeGitWorktree(context) },
    { timeoutMs: 15_000 }
  )
}

export async function getRuntimeGitDiff(
  context: RuntimeGitContext,
  args: { filePath: string; staged: boolean; compareAgainstHead?: boolean }
): Promise<GitDiffResult> {
  const client = await openRuntimeGitClient(context)
  return client.diff({ worktree: getRuntimeGitWorktree(context), ...args }, { timeoutMs: 15_000 })
}

export async function getRuntimeGitBranchCompare(
  context: RuntimeGitContext,
  baseRef: string
): Promise<GitBranchCompareResult> {
  const client = await openRuntimeGitClient(context)
  return client.branchCompare(
    { worktree: getRuntimeGitWorktree(context), baseRef },
    { timeoutMs: 15_000 }
  )
}

export async function getRuntimeGitCommitCompare(
  context: RuntimeGitContext,
  commitId: string
): Promise<GitCommitCompareResult> {
  const client = await openRuntimeGitClient(context)
  return client.commitCompare(
    { worktree: getRuntimeGitWorktree(context), commitId },
    { timeoutMs: 15_000 }
  )
}

export async function getRuntimeGitBranchDiff(
  context: RuntimeGitContext,
  args: {
    compare: { baseRef: string; baseOid: string; headOid: string; mergeBase: string }
    filePath: string
    oldPath?: string
  }
): Promise<GitDiffResult> {
  const client = await openRuntimeGitClient(context)
  return client.branchDiff(
    {
      worktree: getRuntimeGitWorktree(context),
      filePath: args.filePath,
      oldPath: args.oldPath,
      compare: { headOid: args.compare.headOid, mergeBase: args.compare.mergeBase }
    },
    { timeoutMs: 15_000 }
  )
}

export async function getRuntimeGitCommitDiff(
  context: RuntimeGitContext,
  args: { commitOid: string; parentOid?: string | null; filePath: string; oldPath?: string }
): Promise<GitDiffResult> {
  const client = await openRuntimeGitClient(context)
  return client.commitDiff(
    { worktree: getRuntimeGitWorktree(context), ...args },
    { timeoutMs: 15_000 }
  )
}

export async function getRuntimeGitRemoteCommitUrl(
  context: RuntimeGitContext,
  args: { sha: string }
): Promise<string | null> {
  const client = await openRuntimeGitClient(context)
  return client.remoteCommitUrl(
    { worktree: getRuntimeGitWorktree(context), ...args },
    { timeoutMs: 15_000 }
  )
}

export async function findRuntimeGitHugeFoldersToIgnore(
  context: RuntimeGitContext
): Promise<string[]> {
  const client = await openRuntimeGitClient(context)
  return client.findHugeFoldersToIgnore(
    { worktree: getRuntimeGitWorktree(context) },
    { timeoutMs: 15_000 }
  )
}
