import {
  GitStagingService,
  GitStagingServiceAppendGitignoreRequestSchema,
  GitStagingServiceAppendGitignoreResponseSchema,
  GitStagingServiceBulkDiscardRequestSchema,
  GitStagingServiceBulkDiscardResponseSchema,
  GitStagingServiceBulkStageRequestSchema,
  GitStagingServiceBulkStageResponseSchema,
  GitStagingServiceBulkUnstageRequestSchema,
  GitStagingServiceBulkUnstageResponseSchema,
  GitStagingServiceCommitRequestSchema,
  GitStagingServiceCommitResponseSchema,
  GitStagingServiceDiscardRequestSchema,
  GitStagingServiceDiscardResponseSchema,
  GitStagingServiceStageRequestSchema,
  GitStagingServiceStageResponseSchema,
  GitStagingServiceUnstageRequestSchema,
  GitStagingServiceUnstageResponseSchema
} from '../../generated/agent_start/runtime/v1/git_staging_pb.js'
import type { RuntimeCallOptions } from '../transport.js'
import { GitStatusClient } from './status-client.js'

function procedure(service: { typeName: string }, name: string): string {
  return `/${service.typeName}/${name}`
}

export class GitStagingClient extends GitStatusClient {
  async stage(
    input: { worktree: string; filePath: string },
    options?: RuntimeCallOptions
  ): Promise<void> {
    await this.unary(
      procedure(GitStagingService, GitStagingService.method.stage.name),
      GitStagingServiceStageRequestSchema,
      input,
      GitStagingServiceStageResponseSchema,
      options
    )
  }

  async unstage(
    input: { worktree: string; filePath: string },
    options?: RuntimeCallOptions
  ): Promise<void> {
    await this.unary(
      procedure(GitStagingService, GitStagingService.method.unstage.name),
      GitStagingServiceUnstageRequestSchema,
      input,
      GitStagingServiceUnstageResponseSchema,
      options
    )
  }

  async discard(
    input: { worktree: string; filePath: string },
    options?: RuntimeCallOptions
  ): Promise<void> {
    await this.unary(
      procedure(GitStagingService, GitStagingService.method.discard.name),
      GitStagingServiceDiscardRequestSchema,
      input,
      GitStagingServiceDiscardResponseSchema,
      options
    )
  }

  async bulkStage(
    input: { worktree: string; filePaths: string[] },
    options?: RuntimeCallOptions
  ): Promise<void> {
    await this.unary(
      procedure(GitStagingService, GitStagingService.method.bulkStage.name),
      GitStagingServiceBulkStageRequestSchema,
      input,
      GitStagingServiceBulkStageResponseSchema,
      options
    )
  }

  async bulkUnstage(
    input: { worktree: string; filePaths: string[] },
    options?: RuntimeCallOptions
  ): Promise<void> {
    await this.unary(
      procedure(GitStagingService, GitStagingService.method.bulkUnstage.name),
      GitStagingServiceBulkUnstageRequestSchema,
      input,
      GitStagingServiceBulkUnstageResponseSchema,
      options
    )
  }

  async bulkDiscard(
    input: { worktree: string; filePaths: string[] },
    options?: RuntimeCallOptions
  ): Promise<void> {
    await this.unary(
      procedure(GitStagingService, GitStagingService.method.bulkDiscard.name),
      GitStagingServiceBulkDiscardRequestSchema,
      input,
      GitStagingServiceBulkDiscardResponseSchema,
      options
    )
  }

  async commit(
    input: { worktree: string; message: string },
    options?: RuntimeCallOptions
  ): Promise<{ success: boolean; error?: string }> {
    const response = await this.unary(
      procedure(GitStagingService, GitStagingService.method.commit.name),
      GitStagingServiceCommitRequestSchema,
      input,
      GitStagingServiceCommitResponseSchema,
      options
    )
    return { success: response.success, ...(response.error ? { error: response.error } : {}) }
  }

  async appendGitignore(
    input: { worktree: string; folderName: string },
    options?: RuntimeCallOptions
  ): Promise<boolean> {
    const response = await this.unary(
      procedure(GitStagingService, GitStagingService.method.appendGitignore.name),
      GitStagingServiceAppendGitignoreRequestSchema,
      input,
      GitStagingServiceAppendGitignoreResponseSchema,
      options
    )
    return response.appended
  }
}
