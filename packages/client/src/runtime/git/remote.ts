import type {
  GitForkSyncExpectedUpstream,
  GitForkSyncResult
} from '@agentstart/protocol/git/fork-sync-types'
import type { GitUpstreamStatus } from '@agentstart/protocol/git/status-types'
import type { GitPushTarget } from '@agentstart/protocol/git/worktree-source'

import { openRuntimeGitClient } from './client'
import { getRuntimeGitWorktree, type RuntimeGitContext } from './context'

export async function getRuntimeGitUpstreamStatus(
  context: RuntimeGitContext,
  pushTarget?: GitPushTarget
): Promise<GitUpstreamStatus> {
  const client = await openRuntimeGitClient(context)
  return client.upstreamStatus(
    { worktree: getRuntimeGitWorktree(context), pushTarget },
    { timeoutMs: 15_000 }
  )
}

export async function fetchRuntimeGit(
  context: RuntimeGitContext,
  pushTarget?: GitPushTarget
): Promise<void> {
  const client = await openRuntimeGitClient(context)
  await client.fetch(
    { worktree: getRuntimeGitWorktree(context), pushTarget },
    { timeoutMs: 30_000 }
  )
}

export async function syncRuntimeGitForkDefaultBranch(
  context: RuntimeGitContext,
  expectedUpstream: GitForkSyncExpectedUpstream
): Promise<GitForkSyncResult> {
  const client = await openRuntimeGitClient(context)
  return client.forkSync(
    { worktree: getRuntimeGitWorktree(context), expectedUpstream },
    { timeoutMs: 60_000 }
  )
}

export async function pullRuntimeGit(
  context: RuntimeGitContext,
  pushTarget?: GitPushTarget
): Promise<void> {
  const client = await openRuntimeGitClient(context)
  await client.pull({ worktree: getRuntimeGitWorktree(context), pushTarget }, { timeoutMs: 30_000 })
}

export async function fastForwardRuntimeGit(
  context: RuntimeGitContext,
  pushTarget?: GitPushTarget
): Promise<void> {
  const client = await openRuntimeGitClient(context)
  await client.fastForward(
    { worktree: getRuntimeGitWorktree(context), pushTarget },
    { timeoutMs: 30_000 }
  )
}

export async function rebaseRuntimeGitFromBase(
  context: RuntimeGitContext,
  baseRef: string
): Promise<void> {
  const client = await openRuntimeGitClient(context)
  await client.rebaseFromBase(
    { worktree: getRuntimeGitWorktree(context), baseRef },
    { timeoutMs: 30_000 }
  )
}

export async function pushRuntimeGit(
  context: RuntimeGitContext,
  args: { publish?: boolean; pushTarget?: GitPushTarget; forceWithLease?: boolean } = {}
): Promise<void> {
  const client = await openRuntimeGitClient(context)
  await client.push({ worktree: getRuntimeGitWorktree(context), ...args }, { timeoutMs: 30_000 })
}
