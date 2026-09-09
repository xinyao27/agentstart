import { openRuntimeGitClient } from './client'
import { getRuntimeGitWorktree, type RuntimeGitContext } from './context'

export async function commitRuntimeGit(
  context: RuntimeGitContext,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const client = await openRuntimeGitClient(context)
  return client.commit({ worktree: getRuntimeGitWorktree(context), message }, { timeoutMs: 30_000 })
}

export async function stageRuntimeGitPath(
  context: RuntimeGitContext,
  filePath: string
): Promise<void> {
  const client = await openRuntimeGitClient(context)
  await client.stage({ worktree: getRuntimeGitWorktree(context), filePath }, { timeoutMs: 15_000 })
}

export async function bulkStageRuntimeGitPaths(
  context: RuntimeGitContext,
  filePaths: string[]
): Promise<void> {
  const client = await openRuntimeGitClient(context)
  await client.bulkStage(
    { worktree: getRuntimeGitWorktree(context), filePaths },
    { timeoutMs: 15_000 }
  )
}

export async function unstageRuntimeGitPath(
  context: RuntimeGitContext,
  filePath: string
): Promise<void> {
  const client = await openRuntimeGitClient(context)
  await client.unstage(
    { worktree: getRuntimeGitWorktree(context), filePath },
    { timeoutMs: 15_000 }
  )
}

export async function bulkUnstageRuntimeGitPaths(
  context: RuntimeGitContext,
  filePaths: string[]
): Promise<void> {
  const client = await openRuntimeGitClient(context)
  await client.bulkUnstage(
    { worktree: getRuntimeGitWorktree(context), filePaths },
    { timeoutMs: 15_000 }
  )
}

export async function bulkDiscardRuntimeGitPaths(
  context: RuntimeGitContext,
  filePaths: string[]
): Promise<void> {
  const client = await openRuntimeGitClient(context)
  await client.bulkDiscard(
    { worktree: getRuntimeGitWorktree(context), filePaths },
    { timeoutMs: 15_000 }
  )
}

export async function discardRuntimeGitPath(
  context: RuntimeGitContext,
  filePath: string
): Promise<void> {
  const client = await openRuntimeGitClient(context)
  await client.discard(
    { worktree: getRuntimeGitWorktree(context), filePath },
    { timeoutMs: 15_000 }
  )
}

export async function appendRuntimeGitignore(
  context: RuntimeGitContext,
  folderName: string
): Promise<boolean> {
  const client = await openRuntimeGitClient(context)
  return client.appendGitignore(
    { worktree: getRuntimeGitWorktree(context), folderName },
    { timeoutMs: 15_000 }
  )
}
