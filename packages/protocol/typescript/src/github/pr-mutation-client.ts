import {
  GitHubServiceMergePrRequestSchema,
  GitHubServiceMergePrResponseSchema,
  GitHubServiceRemovePrReviewersRequestSchema,
  GitHubServiceRemovePrReviewersResponseSchema,
  GitHubServiceRequestPrReviewersRequestSchema,
  GitHubServiceRequestPrReviewersResponseSchema,
  GitHubServiceResolveReviewThreadRequestSchema,
  GitHubServiceResolveReviewThreadResponseSchema,
  GitHubServiceSetPrAutoMergeRequestSchema,
  GitHubServiceSetPrAutoMergeResponseSchema,
  GitHubServiceSetPrFileViewedRequestSchema,
  GitHubServiceSetPrFileViewedResponseSchema,
  GitHubServiceUpdatePrRequestSchema,
  GitHubServiceUpdatePrResponseSchema,
  GitHubServiceUpdatePrStateRequestSchema,
  GitHubServiceUpdatePrStateResponseSchema,
  GitHubServiceUpdatePrTitleRequestSchema,
  GitHubServiceUpdatePrTitleResponseSchema
} from '../../generated/yiru/runtime/v1/github_pb.js'
import type { RuntimeCallOptions } from '../transport.js'
import {
  githubMergeMethodInput,
  githubMutationResult,
  githubPrOpenStateInput
} from './mutation-values.js'
import type { GitHubMutationResult } from './mutation-values.js'
import { GitHubPrClient } from './pr-client.js'
import type { GitHubOwnerRepo, GitHubPRMergeMethod } from './values.js'

export class GitHubPrMutationClient extends GitHubPrClient {
  async resolveReviewThread(
    repo: string,
    threadId: string,
    resolve: boolean,
    options?: RuntimeCallOptions
  ): Promise<boolean> {
    const response = await this.call(
      'resolveReviewThread',
      GitHubServiceResolveReviewThreadRequestSchema,
      GitHubServiceResolveReviewThreadResponseSchema,
      { repo, threadId, resolve },
      options
    )
    return response.ok
  }

  async setPrFileViewed(
    repo: string,
    pullRequestId: string,
    path: string,
    viewed: boolean,
    options?: RuntimeCallOptions
  ): Promise<boolean> {
    const response = await this.call(
      'setPrFileViewed',
      GitHubServiceSetPrFileViewedRequestSchema,
      GitHubServiceSetPrFileViewedResponseSchema,
      { repo, pullRequestId, path, viewed },
      options
    )
    return response.ok
  }

  async updatePrTitle(
    input: { repo: string; prNumber: number; title: string; prRepo?: GitHubOwnerRepo },
    options?: RuntimeCallOptions
  ): Promise<boolean> {
    const response = await this.call(
      'updatePrTitle',
      GitHubServiceUpdatePrTitleRequestSchema,
      GitHubServiceUpdatePrTitleResponseSchema,
      {
        repo: input.repo,
        prNumber: BigInt(input.prNumber),
        title: input.title,
        prRepo: input.prRepo
      },
      options
    )
    return response.ok
  }

  async updatePr(
    input: {
      repo: string
      prNumber: number
      title?: string
      body?: string
      prRepo?: GitHubOwnerRepo
    },
    options?: RuntimeCallOptions
  ): Promise<GitHubMutationResult> {
    const response = await this.call(
      'updatePr',
      GitHubServiceUpdatePrRequestSchema,
      GitHubServiceUpdatePrResponseSchema,
      {
        repo: input.repo,
        prNumber: BigInt(input.prNumber),
        title: input.title,
        body: input.body,
        prRepo: input.prRepo
      },
      options
    )
    return githubMutationResult(response.result)
  }

  async updatePrState(
    repo: string,
    prNumber: number,
    state: 'open' | 'closed',
    options?: RuntimeCallOptions
  ): Promise<GitHubMutationResult> {
    const response = await this.call(
      'updatePrState',
      GitHubServiceUpdatePrStateRequestSchema,
      GitHubServiceUpdatePrStateResponseSchema,
      { repo, prNumber: BigInt(prNumber), state: githubPrOpenStateInput(state) },
      options
    )
    return githubMutationResult(response.result)
  }

  async mergePr(
    input: {
      repo: string
      prNumber: number
      method?: GitHubPRMergeMethod
      prRepo?: GitHubOwnerRepo
    },
    options?: RuntimeCallOptions
  ): Promise<GitHubMutationResult> {
    const response = await this.call(
      'mergePr',
      GitHubServiceMergePrRequestSchema,
      GitHubServiceMergePrResponseSchema,
      {
        repo: input.repo,
        prNumber: BigInt(input.prNumber),
        method: githubMergeMethodInput(input.method ?? 'squash'),
        prRepo: input.prRepo
      },
      options
    )
    return githubMutationResult(response.result)
  }

  async setPrAutoMerge(
    input: {
      repo: string
      prNumber: number
      enabled: boolean
      method?: GitHubPRMergeMethod
      prRepo?: GitHubOwnerRepo
    },
    options?: RuntimeCallOptions
  ): Promise<GitHubMutationResult> {
    const response = await this.call(
      'setPrAutoMerge',
      GitHubServiceSetPrAutoMergeRequestSchema,
      GitHubServiceSetPrAutoMergeResponseSchema,
      {
        repo: input.repo,
        prNumber: BigInt(input.prNumber),
        enabled: input.enabled,
        method: githubMergeMethodInput(input.method ?? 'squash'),
        prRepo: input.prRepo
      },
      options
    )
    return githubMutationResult(response.result)
  }

  async requestPrReviewers(
    repo: string,
    prNumber: number,
    reviewers: string[],
    options?: RuntimeCallOptions
  ): Promise<GitHubMutationResult> {
    const response = await this.call(
      'requestPrReviewers',
      GitHubServiceRequestPrReviewersRequestSchema,
      GitHubServiceRequestPrReviewersResponseSchema,
      { repo, prNumber: BigInt(prNumber), reviewers },
      options
    )
    return githubMutationResult(response.result)
  }

  async removePrReviewers(
    repo: string,
    prNumber: number,
    reviewers: string[],
    options?: RuntimeCallOptions
  ): Promise<GitHubMutationResult> {
    const response = await this.call(
      'removePrReviewers',
      GitHubServiceRemovePrReviewersRequestSchema,
      GitHubServiceRemovePrReviewersResponseSchema,
      { repo, prNumber: BigInt(prNumber), reviewers },
      options
    )
    return githubMutationResult(response.result)
  }
}
