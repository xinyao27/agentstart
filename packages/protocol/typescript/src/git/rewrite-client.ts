import {
  GitHistoryRewriteService,
  GitHistoryRewriteServiceAbortMergeRequestSchema,
  GitHistoryRewriteServiceAbortMergeResponseSchema,
  GitHistoryRewriteServiceAbortRebaseRequestSchema,
  GitHistoryRewriteServiceAbortRebaseResponseSchema,
  GitHistoryRewriteServiceAbortRevertRequestSchema,
  GitHistoryRewriteServiceAbortRevertResponseSchema,
  GitHistoryRewriteServiceCherryPickRequestSchema,
  GitHistoryRewriteServiceCherryPickResponseSchema,
  GitHistoryRewriteServiceConflictOperationRequestSchema,
  GitHistoryRewriteServiceConflictOperationResponseSchema,
  GitHistoryRewriteServiceDropCommitRequestSchema,
  GitHistoryRewriteServiceDropCommitResponseSchema,
  GitHistoryRewriteServiceMergeCommitRequestSchema,
  GitHistoryRewriteServiceMergeCommitResponseSchema,
  GitHistoryRewriteServiceRebaseFromBaseRequestSchema,
  GitHistoryRewriteServiceRebaseFromBaseResponseSchema,
  GitHistoryRewriteServiceRebaseOntoCommitRequestSchema,
  GitHistoryRewriteServiceRebaseOntoCommitResponseSchema,
  GitHistoryRewriteServiceResetToCommitRequestSchema,
  GitHistoryRewriteServiceResetToCommitResponseSchema,
  GitHistoryRewriteServiceRevertCommitRequestSchema,
  GitHistoryRewriteServiceRevertCommitResponseSchema,
  GitResetMode
} from '../../generated/yiru/runtime/v1/git_rewrite_pb.js'
import type { RuntimeCallOptions } from '../transport.js'
import { GitBranchClient } from './branch-client.js'
import { gitConflictOperationFromProto } from './status-values.js'
import type { GitConflictOperation } from './status-values.js'
import { gitWriteOutcomeFromProto, mustOutcome } from './write-values.js'
import type {
  GitCherryPickResult,
  GitDropCommitResult,
  GitMergeCommitResult,
  GitRebaseOntoCommitResult,
  GitResetToCommitResult,
  GitRevertResult
} from './write-values.js'

function procedure(service: { typeName: string }, name: string): string {
  return `/${service.typeName}/${name}`
}

function resetModeToProto(mode: 'soft' | 'mixed' | 'hard'): GitResetMode {
  switch (mode) {
    case 'soft':
      return GitResetMode.SOFT
    case 'mixed':
      return GitResetMode.MIXED
    default:
      return GitResetMode.HARD
  }
}

export class GitHistoryRewriteClient extends GitBranchClient {
  async conflictOperation(
    input: { worktree: string },
    options?: RuntimeCallOptions
  ): Promise<GitConflictOperation> {
    const response = await this.unary(
      procedure(GitHistoryRewriteService, GitHistoryRewriteService.method.conflictOperation.name),
      GitHistoryRewriteServiceConflictOperationRequestSchema,
      input,
      GitHistoryRewriteServiceConflictOperationResponseSchema,
      options
    )
    return gitConflictOperationFromProto(response.operation)
  }

  async abortMerge(input: { worktree: string }, options?: RuntimeCallOptions): Promise<void> {
    await this.unary(
      procedure(GitHistoryRewriteService, GitHistoryRewriteService.method.abortMerge.name),
      GitHistoryRewriteServiceAbortMergeRequestSchema,
      input,
      GitHistoryRewriteServiceAbortMergeResponseSchema,
      options
    )
  }

  async abortRebase(input: { worktree: string }, options?: RuntimeCallOptions): Promise<void> {
    await this.unary(
      procedure(GitHistoryRewriteService, GitHistoryRewriteService.method.abortRebase.name),
      GitHistoryRewriteServiceAbortRebaseRequestSchema,
      input,
      GitHistoryRewriteServiceAbortRebaseResponseSchema,
      options
    )
  }

  async abortRevert(input: { worktree: string }, options?: RuntimeCallOptions): Promise<void> {
    await this.unary(
      procedure(GitHistoryRewriteService, GitHistoryRewriteService.method.abortRevert.name),
      GitHistoryRewriteServiceAbortRevertRequestSchema,
      input,
      GitHistoryRewriteServiceAbortRevertResponseSchema,
      options
    )
  }

  async cherryPick(
    input: { worktree: string; commit: string; mainline?: number },
    options?: RuntimeCallOptions
  ): Promise<GitCherryPickResult> {
    const response = await this.unary(
      procedure(GitHistoryRewriteService, GitHistoryRewriteService.method.cherryPick.name),
      GitHistoryRewriteServiceCherryPickRequestSchema,
      input,
      GitHistoryRewriteServiceCherryPickResponseSchema,
      options
    )
    return gitWriteOutcomeFromProto(mustOutcome(response.outcome))
  }

  async revertCommit(
    input: { worktree: string; commit: string; mainline?: number },
    options?: RuntimeCallOptions
  ): Promise<GitRevertResult> {
    const response = await this.unary(
      procedure(GitHistoryRewriteService, GitHistoryRewriteService.method.revertCommit.name),
      GitHistoryRewriteServiceRevertCommitRequestSchema,
      input,
      GitHistoryRewriteServiceRevertCommitResponseSchema,
      options
    )
    return gitWriteOutcomeFromProto(mustOutcome(response.outcome))
  }

  async dropCommit(
    input: { worktree: string; commit: string },
    options?: RuntimeCallOptions
  ): Promise<GitDropCommitResult> {
    const response = await this.unary(
      procedure(GitHistoryRewriteService, GitHistoryRewriteService.method.dropCommit.name),
      GitHistoryRewriteServiceDropCommitRequestSchema,
      input,
      GitHistoryRewriteServiceDropCommitResponseSchema,
      options
    )
    return gitWriteOutcomeFromProto(mustOutcome(response.outcome))
  }

  async resetToCommit(
    input: { worktree: string; commit: string; mode: 'soft' | 'mixed' | 'hard' },
    options?: RuntimeCallOptions
  ): Promise<GitResetToCommitResult> {
    const response = await this.unary(
      procedure(GitHistoryRewriteService, GitHistoryRewriteService.method.resetToCommit.name),
      GitHistoryRewriteServiceResetToCommitRequestSchema,
      { worktree: input.worktree, commit: input.commit, mode: resetModeToProto(input.mode) },
      GitHistoryRewriteServiceResetToCommitResponseSchema,
      options
    )
    const outcome = gitWriteOutcomeFromProto(mustOutcome(response.outcome))
    return outcome.status === 'conflicts'
      ? { status: 'error', message: 'unexpected conflicts' }
      : outcome
  }

  async rebaseFromBase(
    input: { worktree: string; baseRef: string },
    options?: RuntimeCallOptions
  ): Promise<void> {
    await this.unary(
      procedure(GitHistoryRewriteService, GitHistoryRewriteService.method.rebaseFromBase.name),
      GitHistoryRewriteServiceRebaseFromBaseRequestSchema,
      input,
      GitHistoryRewriteServiceRebaseFromBaseResponseSchema,
      options
    )
  }

  async rebaseOntoCommit(
    input: { worktree: string; commit: string },
    options?: RuntimeCallOptions
  ): Promise<GitRebaseOntoCommitResult> {
    const response = await this.unary(
      procedure(GitHistoryRewriteService, GitHistoryRewriteService.method.rebaseOntoCommit.name),
      GitHistoryRewriteServiceRebaseOntoCommitRequestSchema,
      input,
      GitHistoryRewriteServiceRebaseOntoCommitResponseSchema,
      options
    )
    return gitWriteOutcomeFromProto(mustOutcome(response.outcome))
  }

  async mergeCommit(
    input: { worktree: string; commit: string; noFf?: boolean; squash?: boolean; message?: string },
    options?: RuntimeCallOptions
  ): Promise<GitMergeCommitResult> {
    const response = await this.unary(
      procedure(GitHistoryRewriteService, GitHistoryRewriteService.method.mergeCommit.name),
      GitHistoryRewriteServiceMergeCommitRequestSchema,
      { ...input, noFf: input.noFf ?? false, squash: input.squash ?? false },
      GitHistoryRewriteServiceMergeCommitResponseSchema,
      options
    )
    return gitWriteOutcomeFromProto(mustOutcome(response.outcome))
  }
}
