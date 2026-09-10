import {
  GitHubServiceAddPrCommentRequestSchema,
  GitHubServiceAddPrCommentResponseSchema,
  GitHubServiceAddPrReviewCommentReplyRequestSchema,
  GitHubServiceAddPrReviewCommentReplyResponseSchema,
  GitHubServiceAddPrReviewCommentRequestSchema,
  GitHubServiceAddPrReviewCommentResponseSchema,
  GitHubServiceCreateCommentDraftRequestSchema,
  GitHubServiceCreateCommentDraftResponseSchema
} from '../../generated/agent_start/runtime/v1/github_pb.js'
import type { RuntimeCallOptions } from '../transport.js'
import { githubCommentResult, type GitHubCommentResult } from './comment-values.js'
import { githubCommentDraftKindInput } from './mutation-values.js'
import { GitHubPrMutationClient } from './pr-mutation-client.js'
import type { GitHubOwnerRepo } from './values.js'

export class GitHubCommentClient extends GitHubPrMutationClient {
  async addPrComment(
    input: { repo: string; number: number; body: string; prRepo?: GitHubOwnerRepo },
    options?: RuntimeCallOptions
  ): Promise<GitHubCommentResult> {
    const response = await this.call(
      'addPrComment',
      GitHubServiceAddPrCommentRequestSchema,
      GitHubServiceAddPrCommentResponseSchema,
      { repo: input.repo, number: BigInt(input.number), body: input.body, prRepo: input.prRepo },
      options
    )
    return githubCommentResult(response.result)
  }

  async addPrReviewComment(
    input: {
      repo: string
      prNumber: number
      commitId: string
      path: string
      line: number
      startLine?: number
      body: string
    },
    options?: RuntimeCallOptions
  ): Promise<GitHubCommentResult> {
    const response = await this.call(
      'addPrReviewComment',
      GitHubServiceAddPrReviewCommentRequestSchema,
      GitHubServiceAddPrReviewCommentResponseSchema,
      {
        repo: input.repo,
        prNumber: BigInt(input.prNumber),
        commitId: input.commitId,
        path: input.path,
        line: BigInt(input.line),
        startLine: input.startLine !== undefined ? BigInt(input.startLine) : undefined,
        body: input.body
      },
      options
    )
    return githubCommentResult(response.result)
  }

  async addPrReviewCommentReply(
    input: {
      repo: string
      prNumber: number
      commentId: number
      body: string
      threadId?: string
      path?: string
      line?: number
      prRepo?: GitHubOwnerRepo
    },
    options?: RuntimeCallOptions
  ): Promise<GitHubCommentResult> {
    const response = await this.call(
      'addPrReviewCommentReply',
      GitHubServiceAddPrReviewCommentReplyRequestSchema,
      GitHubServiceAddPrReviewCommentReplyResponseSchema,
      {
        repo: input.repo,
        prNumber: BigInt(input.prNumber),
        commentId: BigInt(input.commentId),
        body: input.body,
        threadId: input.threadId,
        path: input.path,
        line: input.line !== undefined ? BigInt(input.line) : undefined,
        prRepo: input.prRepo
      },
      options
    )
    return githubCommentResult(response.result)
  }

  async createCommentDraft(
    input: {
      projectId: string
      kind: 'issue' | 'pull-request'
      number: number
      pageUrl: string
      pageContext: string
    },
    options?: RuntimeCallOptions
  ): Promise<{ draft: string; generatedAt: number }> {
    const response = await this.call(
      'createCommentDraft',
      GitHubServiceCreateCommentDraftRequestSchema,
      GitHubServiceCreateCommentDraftResponseSchema,
      {
        projectId: input.projectId,
        kind: githubCommentDraftKindInput(input.kind),
        number: BigInt(input.number),
        pageUrl: input.pageUrl,
        pageContext: input.pageContext
      },
      options
    )
    return { draft: response.draft, generatedAt: Math.round(response.generatedAtMs) }
  }
}
