import type {
  MarkdownDocument,
  FileSearchResult as SearchResult
} from '@yiru/protocol/files/values'
import type { FileSearchInput } from '@yiru/protocol/files/values'

import {
  createEmptyRuntimeFileSearchResult,
  getRuntimeFileSearchRejectedField
} from '../file-search-bounds'
import { requireFilesTarget } from '../files-target'
import { getActiveRuntimeTarget } from '../rpc-client'
import { getRuntimeFileWorktreeSelector, type RuntimeFileOperationArgs } from './context'

export async function searchRuntimeFiles(
  context: RuntimeFileOperationArgs,
  options: Omit<FileSearchInput, 'worktree'> & { rootPath: string }
): Promise<SearchResult> {
  if (getRuntimeFileSearchRejectedField(options)) {
    return createEmptyRuntimeFileSearchResult()
  }
  const worktree = requireWorktree(context, 'File search')
  const { rootPath: _rootPath, ...runtimeOptions } = options
  const client = await requireFilesTarget(getActiveRuntimeTarget(context.settings))
  return client.search({ worktree, ...runtimeOptions }, { timeoutMs: 15_000 })
}

export async function listRuntimeFiles(
  context: RuntimeFileOperationArgs,
  args: { rootPath: string; excludePaths?: string[]; requestToken?: string }
): Promise<string[]> {
  const client = await requireFilesTarget(getActiveRuntimeTarget(context.settings))
  return client.listAll(
    { worktree: requireWorktree(context, 'File listing'), excludePaths: args.excludePaths },
    { timeoutMs: 15_000 }
  )
}

export function cancelRuntimeFileList(
  _context: RuntimeFileOperationArgs,
  _requestToken: string
): void {
  // Why: files.listAll has no cancellation token on either runtime target;
  // its RPC timeout bounds abandoned scans.
}

export async function listRuntimeMarkdownDocuments(
  context: RuntimeFileOperationArgs,
  _rootPath: string
): Promise<MarkdownDocument[]> {
  const client = await requireFilesTarget(getActiveRuntimeTarget(context.settings))
  return client.listMarkdownDocuments(requireWorktree(context, 'Markdown listing'), {
    timeoutMs: 15_000
  })
}

function requireWorktree(context: RuntimeFileOperationArgs, operation: string): string {
  const worktree = getRuntimeFileWorktreeSelector(context)
  if (!worktree) {
    throw new Error(`${operation} requires an owning runtime worktree`)
  }
  return worktree
}
