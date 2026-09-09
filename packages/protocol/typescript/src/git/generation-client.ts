import {
  GitGenerationService,
  GitGenerationServiceCancelGenerateCommitMessageRequestSchema,
  GitGenerationServiceCancelGenerateCommitMessageResponseSchema,
  GitGenerationServiceCancelGeneratePullRequestFieldsRequestSchema,
  GitGenerationServiceCancelGeneratePullRequestFieldsResponseSchema,
  GitGenerationServiceGenerateCommitMessageRequestSchema,
  GitGenerationServiceGenerateCommitMessageResponseSchema,
  GitGenerationServiceGeneratePullRequestFieldsRequestSchema,
  GitGenerationServiceGeneratePullRequestFieldsResponseSchema
} from '../../generated/yiru/runtime/v1/git_generation_pb.js'
import type { RuntimeCallOptions } from '../transport.js'
import {
  generateCommitMessageResultFromProto,
  generatePullRequestFieldsResultFromProto,
  type RuntimeGenerateCommitMessageResult,
  type RuntimeGeneratePullRequestFieldsResult
} from './generation-values.js'
import {
  gitGenerationOverridesToProto,
  type GitGenerationOverridesInput
} from './overrides-values.js'
import { GitRemoteClient } from './remote-client.js'

function procedure(service: { typeName: string }, name: string): string {
  return `/${service.typeName}/${name}`
}

export class GitGenerationClient extends GitRemoteClient {
  async generateCommitMessage(
    input: { worktree: string; overrides: GitGenerationOverridesInput },
    options?: RuntimeCallOptions
  ): Promise<RuntimeGenerateCommitMessageResult> {
    const response = await this.unary(
      procedure(GitGenerationService, GitGenerationService.method.generateCommitMessage.name),
      GitGenerationServiceGenerateCommitMessageRequestSchema,
      { worktree: input.worktree, overrides: gitGenerationOverridesToProto(input.overrides) },
      GitGenerationServiceGenerateCommitMessageResponseSchema,
      options
    )
    return generateCommitMessageResultFromProto(response)
  }

  async cancelGenerateCommitMessage(
    input: { worktree: string },
    options?: RuntimeCallOptions
  ): Promise<void> {
    await this.unary(
      procedure(GitGenerationService, GitGenerationService.method.cancelGenerateCommitMessage.name),
      GitGenerationServiceCancelGenerateCommitMessageRequestSchema,
      input,
      GitGenerationServiceCancelGenerateCommitMessageResponseSchema,
      options
    )
  }

  async generatePullRequestFields(
    input: {
      worktree: string
      base: string
      title: string
      body: string
      draft: boolean
      useTemplate?: boolean
      overrides: GitGenerationOverridesInput
    },
    options?: RuntimeCallOptions
  ): Promise<RuntimeGeneratePullRequestFieldsResult> {
    const response = await this.unary(
      procedure(GitGenerationService, GitGenerationService.method.generatePullRequestFields.name),
      GitGenerationServiceGeneratePullRequestFieldsRequestSchema,
      { ...input, overrides: gitGenerationOverridesToProto(input.overrides) },
      GitGenerationServiceGeneratePullRequestFieldsResponseSchema,
      options
    )
    return generatePullRequestFieldsResultFromProto(response)
  }

  async cancelGeneratePullRequestFields(
    input: { worktree: string },
    options?: RuntimeCallOptions
  ): Promise<void> {
    await this.unary(
      procedure(
        GitGenerationService,
        GitGenerationService.method.cancelGeneratePullRequestFields.name
      ),
      GitGenerationServiceCancelGeneratePullRequestFieldsRequestSchema,
      input,
      GitGenerationServiceCancelGeneratePullRequestFieldsResponseSchema,
      options
    )
  }
}
