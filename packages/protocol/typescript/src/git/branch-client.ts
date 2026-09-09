import {
  GitBranchService,
  GitBranchServiceAddTagRequestSchema,
  GitBranchServiceAddTagResponseSchema,
  GitBranchServiceCheckoutCommitRequestSchema,
  GitBranchServiceCheckoutCommitResponseSchema,
  GitBranchServiceCheckoutRequestSchema,
  GitBranchServiceCheckoutResponseSchema,
  GitBranchServiceCreateBranchRequestSchema,
  GitBranchServiceCreateBranchResponseSchema
} from '../../generated/yiru/runtime/v1/git_branch_pb.js'
import type { RuntimeCallOptions } from '../transport.js'
import { GitStagingClient } from './staging-client.js'
import { gitWriteOutcomeFromProto, mustOutcome } from './write-values.js'
import type {
  GitAddTagResult,
  GitCheckoutCommitResult,
  GitCreateBranchResult
} from './write-values.js'

function procedure(service: { typeName: string }, name: string): string {
  return `/${service.typeName}/${name}`
}

export class GitBranchClient extends GitStagingClient {
  async checkout(
    input: { worktree: string; branch: string },
    options?: RuntimeCallOptions
  ): Promise<{ ok: boolean; branch: string }> {
    return this.unary(
      procedure(GitBranchService, GitBranchService.method.checkout.name),
      GitBranchServiceCheckoutRequestSchema,
      input,
      GitBranchServiceCheckoutResponseSchema,
      options
    )
  }

  async checkoutCommit(
    input: { worktree: string; commit: string },
    options?: RuntimeCallOptions
  ): Promise<GitCheckoutCommitResult> {
    const response = await this.unary(
      procedure(GitBranchService, GitBranchService.method.checkoutCommit.name),
      GitBranchServiceCheckoutCommitRequestSchema,
      input,
      GitBranchServiceCheckoutCommitResponseSchema,
      options
    )
    const outcome = gitWriteOutcomeFromProto(mustOutcome(response.outcome))
    if (outcome.status === 'ok') {
      return { status: 'ok', commit: response.commit ?? '' }
    }
    // Why: checkout of a fixed commit never merges, so the shared GitWriteOutcome wire
    // shape cannot legitimately report conflicts here.
    return outcome.status === 'conflicts'
      ? { status: 'error', message: 'unexpected conflicts' }
      : outcome
  }

  async createBranch(
    input: { worktree: string; commit: string; name: string; checkout?: boolean },
    options?: RuntimeCallOptions
  ): Promise<GitCreateBranchResult> {
    const response = await this.unary(
      procedure(GitBranchService, GitBranchService.method.createBranch.name),
      GitBranchServiceCreateBranchRequestSchema,
      { ...input, checkout: input.checkout ?? false },
      GitBranchServiceCreateBranchResponseSchema,
      options
    )
    const outcome = gitWriteOutcomeFromProto(mustOutcome(response.outcome))
    if (outcome.status === 'ok') {
      return {
        status: 'ok',
        branch: response.branch ?? '',
        checkedOut: response.checkedOut ?? false
      }
    }
    // Why: creating a branch pointer never merges, so the shared GitWriteOutcome wire
    // shape cannot legitimately report conflicts here.
    return outcome.status === 'conflicts'
      ? { status: 'error', message: 'unexpected conflicts' }
      : outcome
  }

  async addTag(
    input: { worktree: string; commit: string; name: string; message?: string; force?: boolean },
    options?: RuntimeCallOptions
  ): Promise<GitAddTagResult> {
    const response = await this.unary(
      procedure(GitBranchService, GitBranchService.method.addTag.name),
      GitBranchServiceAddTagRequestSchema,
      { ...input, force: input.force ?? false },
      GitBranchServiceAddTagResponseSchema,
      options
    )
    const outcome = gitWriteOutcomeFromProto(mustOutcome(response.outcome))
    if (outcome.status === 'ok') {
      return { status: 'ok', tag: response.tag ?? '' }
    }
    // Why: tagging a commit never merges, so the shared GitWriteOutcome wire shape
    // cannot legitimately report conflicts here.
    return outcome.status === 'conflicts'
      ? { status: 'error', message: 'unexpected conflicts' }
      : outcome
  }
}
