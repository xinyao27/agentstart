import {
  GitHubServiceCreateHostedReviewRequestSchema,
  GitHubServiceCreateHostedReviewResponseSchema,
  GitHubServiceGetHostedReviewCreationEligibilityRequestSchema,
  GitHubServiceGetHostedReviewCreationEligibilityResponseSchema,
  GitHubServiceGetHostedReviewForBranchRequestSchema,
  GitHubServiceGetHostedReviewForBranchResponseSchema
} from '../../generated/agent_start/runtime/v1/github_pb.js'
import type { RuntimeCallOptions } from '../transport.js'
import { GitHubCommentClient } from './comment-client.js'
import {
  githubCreateHostedReviewResult,
  githubHostedReviewEligibility,
  githubHostedReviewProviderInput,
  type CreateHostedReviewResult,
  type HostedReviewEligibility
} from './hosted-review-values.js'
import { branchLookup, type GitHubPrBranchLookupInput } from './pr-client.js'
import { githubPrInfo } from './pr-values.js'
import type { PRInfo } from './values.js'

export class GitHubHostedReviewClient extends GitHubCommentClient {
  async getHostedReviewForBranch(
    repo: string,
    branch: string,
    lookup?: GitHubPrBranchLookupInput,
    options?: RuntimeCallOptions
  ): Promise<PRInfo | null> {
    const response = await this.call(
      'getHostedReviewForBranch',
      GitHubServiceGetHostedReviewForBranchRequestSchema,
      GitHubServiceGetHostedReviewForBranchResponseSchema,
      { repo, branch, lookup: branchLookup(lookup) },
      options
    )
    return githubPrInfo(response.review)
  }

  async getHostedReviewCreationEligibility(
    input: {
      repo: string
      worktree?: string
      branch: string
      // Why: callers hold the workbench review state, which keeps cleared
      // optionals as explicit nulls; null normalizes to an absent field.
      base?: string | null
      hasUncommittedChanges?: boolean
      hasUpstream?: boolean
      ahead?: number
      behind?: number
      linkedGitHubPR?: number | null
      fallbackGitHubPR?: number | null
    },
    options?: RuntimeCallOptions
  ): Promise<HostedReviewEligibility> {
    const response = await this.call(
      'getHostedReviewCreationEligibility',
      GitHubServiceGetHostedReviewCreationEligibilityRequestSchema,
      GitHubServiceGetHostedReviewCreationEligibilityResponseSchema,
      {
        repo: input.repo,
        worktree: input.worktree,
        branch: input.branch,
        base: input.base ?? undefined,
        hasUncommittedChanges: input.hasUncommittedChanges,
        hasUpstream: input.hasUpstream,
        ahead: input.ahead !== undefined ? BigInt(input.ahead) : undefined,
        behind: input.behind !== undefined ? BigInt(input.behind) : undefined,
        linkedGithubPr: input.linkedGitHubPR != null ? BigInt(input.linkedGitHubPR) : undefined,
        fallbackGithubPr:
          input.fallbackGitHubPR != null ? BigInt(input.fallbackGitHubPR) : undefined
      },
      options
    )
    return githubHostedReviewEligibility(response)
  }

  async createHostedReview(
    input: {
      repo: string
      worktree?: string
      provider: 'github' | 'unsupported'
      base: string
      head?: string
      title: string
      body?: string
      draft?: boolean
      useTemplate?: boolean
    },
    options?: RuntimeCallOptions
  ): Promise<CreateHostedReviewResult> {
    const response = await this.call(
      'createHostedReview',
      GitHubServiceCreateHostedReviewRequestSchema,
      GitHubServiceCreateHostedReviewResponseSchema,
      {
        repo: input.repo,
        worktree: input.worktree,
        provider: githubHostedReviewProviderInput(input.provider),
        base: input.base,
        head: input.head,
        title: input.title,
        body: input.body,
        draft: input.draft ?? false,
        useTemplate: input.useTemplate ?? false
      },
      options
    )
    return githubCreateHostedReviewResult(response)
  }
}
