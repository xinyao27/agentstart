import type {
  GitBranchChangeEntry,
  GitBranchCompareSummary
} from '@agentstart/protocol/git/branch-compare-types'
import type {
  GitConflictKind,
  GitConflictOperation,
  GitStatusEntry,
  GitStatusResult,
  GitUpstreamStatus
} from '@agentstart/protocol/git/status-types'
import type { GitPushTarget } from '@agentstart/protocol/git/worktree-source'

import type { SourceControlRemoteOpKind } from '../source-control/workflow/types'
import type { GitRuntimeOperationOptions } from './file-model'

type RemoteOpKind = SourceControlRemoteOpKind

export type EditorGitSlice = {
  // Cursor line tracking per file
  editorCursorLine: Record<string, number>
  setEditorCursorLine: (fileId: string, line: number) => void

  // Git status cache
  gitStatusByWorktree: Record<string, GitStatusEntry[]>
  gitStatusHeadByWorktree: Record<string, string>
  // Why: when status was truncated at the entry limit (a repo with an enormous
  // un-ignored folder), the SCM view shows a "too many changes" state and
  // polling pauses. `{ limit }` when huge, absent otherwise.
  gitStatusHugeByWorktree: Record<string, { limit: number }>
  gitIgnoredPathsByWorktree: Record<string, string[]>
  gitConflictOperationByWorktree: Record<string, GitConflictOperation>
  trackedConflictPathsByWorktree: Record<string, Record<string, GitConflictKind>>
  trackConflictPath: (worktreeId: string, path: string, conflictKind: GitConflictKind) => void
  setGitStatus: (worktreeId: string, status: GitStatusResult) => void
  // Why: lightweight updater for conflict operation only, used to clear stale
  // "Rebasing"/"Merging" badges on non-active worktrees without a full git status poll.
  setConflictOperation: (worktreeId: string, operation: GitConflictOperation) => void
  remoteStatusesByWorktree: Record<string, GitUpstreamStatus>
  setUpstreamStatus: (worktreeId: string, status: GitUpstreamStatus) => void
  // Why: refcount-backed busy flag. A bare boolean races across worktrees —
  // push on A finishing while pull on B is still in flight would flip the
  // flag off and prematurely re-enable B's button. beginRemoteOperation /
  // endRemoteOperation must be paired (begin at the start of the async
  // operation, end in finally) so the derived boolean only flips to false
  // once every in-flight remote op has finished.
  isRemoteOperationActive: boolean
  remoteOperationDepth: number
  // Why: surfaces *which* remote op the user actually triggered so the
  // primary button can mirror it (label + spinner) rather than leaving a
  // stale label from before the dropdown click. Cleared when depth hits 0.
  // Last-write-wins on concurrent ops, which is fine — the UI disables
  // every entry while busy, so concurrent ops can't be initiated through it.
  inFlightRemoteOpKind: RemoteOpKind | null
  beginRemoteOperation: (kind?: RemoteOpKind) => void
  endRemoteOperation: () => void
  fetchUpstreamStatus: (
    worktreeId: string,
    worktreePath: string,
    connectionId?: string,
    pushTarget?: GitPushTarget,
    options?: GitRuntimeOperationOptions
  ) => Promise<GitUpstreamStatus | null>
  pushBranch: (
    worktreeId: string,
    worktreePath: string,
    publish?: boolean,
    connectionId?: string,
    pushTarget?: GitPushTarget,
    options?: GitRuntimeOperationOptions & { forceWithLease?: boolean }
  ) => Promise<void>
  pullBranch: (
    worktreeId: string,
    worktreePath: string,
    connectionId?: string,
    pushTarget?: GitPushTarget,
    options?: GitRuntimeOperationOptions
  ) => Promise<void>
  fastForwardBranch: (
    worktreeId: string,
    worktreePath: string,
    connectionId?: string,
    pushTarget?: GitPushTarget,
    options?: GitRuntimeOperationOptions
  ) => Promise<void>
  syncBranch: (
    worktreeId: string,
    worktreePath: string,
    connectionId?: string,
    pushTarget?: GitPushTarget,
    options?: GitRuntimeOperationOptions
  ) => Promise<void>
  rebaseFromBase: (
    worktreeId: string,
    worktreePath: string,
    baseRef: string,
    connectionId?: string,
    pushTarget?: GitPushTarget,
    options?: GitRuntimeOperationOptions
  ) => Promise<void>
  fetchBranch: (
    worktreeId: string,
    worktreePath: string,
    connectionId?: string,
    pushTarget?: GitPushTarget,
    options?: GitRuntimeOperationOptions
  ) => Promise<void>
  gitBranchChangesByWorktree: Record<string, GitBranchChangeEntry[]>
  gitBranchCompareSummaryByWorktree: Record<string, GitBranchCompareSummary | null>
  gitBranchCompareRequestKeyByWorktree: Record<string, string>
  gitBranchCompareRequestStatusHeadByWorktree: Record<string, string | null>
  beginGitBranchCompareRequest: (
    worktreeId: string,
    requestKey: string,
    baseRef: string,
    options?: { preserveExistingSummary?: boolean }
  ) => void
  setGitBranchCompareResult: (
    worktreeId: string,
    requestKey: string,
    result: { summary: GitBranchCompareSummary; entries: GitBranchChangeEntry[] }
  ) => void
  clearGitBranchCompare: (worktreeId: string) => void
}
