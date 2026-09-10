import { create } from '@bufbuild/protobuf'

import {
  GitHubPrBranchLookupSchema,
  GitHubServiceGetPrCheckDetailsRequestSchema,
  GitHubServiceGetPrCheckDetailsResponseSchema,
  GitHubServiceGetPrChecksRequestSchema,
  GitHubServiceGetPrChecksResponseSchema,
  GitHubServiceGetPrCommentsRequestSchema,
  GitHubServiceGetPrCommentsResponseSchema,
  GitHubServiceGetPrFileContentsRequestSchema,
  GitHubServiceGetPrFileContentsResponseSchema,
  GitHubServiceGetPrForBranchRequestSchema,
  GitHubServiceGetPrForBranchResponseSchema,
  GitHubServiceRefreshPrForBranchRequestSchema,
  GitHubServiceRefreshPrForBranchResponseSchema,
  GitHubServiceRerunPrChecksRequestSchema,
  GitHubServiceRerunPrChecksResponseSchema,
  type GitHubPrBranchLookup
} from '../../generated/agent_start/runtime/v1/github_pb.js'
import type { RuntimeCallOptions } from '../transport.js'
import {
  githubCheckDetails,
  githubCheckEntry,
  type PRCheckDetail,
  type PRCheckRunDetails,
  type GitHubRerunPRChecksResult
} from './check-values.js'
import { githubComment, type PRComment } from './comment-values.js'
import { githubFileStatusInput } from './mutation-values.js'
import type { GitHubPRFile } from './pr-file-values.js'
import { githubPrInfo, githubRefreshOutcome, type PRRefreshOutcome } from './pr-values.js'
import { GitHubRepoClient } from './repo-client.js'
import type { GitHubOwnerRepo, PRInfo } from './values.js'

export type GitHubPrBranchLookupInput = {
  linkedPRNumber?: number | null
  fallbackPRNumber?: number | null
  acceptMergedFallbackPR?: boolean
  currentHeadOid?: string | null
}

export function branchLookup(input: GitHubPrBranchLookupInput | undefined): GitHubPrBranchLookup {
  return create(GitHubPrBranchLookupSchema, {
    linkedPrNumber: input?.linkedPRNumber ? BigInt(input.linkedPRNumber) : undefined,
    fallbackPrNumber: input?.fallbackPRNumber ? BigInt(input.fallbackPRNumber) : undefined,
    acceptMergedFallbackPr: input?.acceptMergedFallbackPR ?? false,
    currentHeadOid: input?.currentHeadOid ?? undefined
  })
}

export class GitHubPrClient extends GitHubRepoClient {
  async getPrForBranch(
    repo: string,
    branch: string,
    lookup?: GitHubPrBranchLookupInput,
    options?: RuntimeCallOptions
  ): Promise<PRInfo | null> {
    const response = await this.call(
      'getPrForBranch',
      GitHubServiceGetPrForBranchRequestSchema,
      GitHubServiceGetPrForBranchResponseSchema,
      { repo, branch, lookup: branchLookup(lookup) },
      options
    )
    return githubPrInfo(response.pr)
  }

  async refreshPrForBranch(
    repo: string,
    branch: string,
    lookup?: GitHubPrBranchLookupInput,
    options?: RuntimeCallOptions
  ): Promise<PRRefreshOutcome> {
    const response = await this.call(
      'refreshPrForBranch',
      GitHubServiceRefreshPrForBranchRequestSchema,
      GitHubServiceRefreshPrForBranchResponseSchema,
      { repo, branch, lookup: branchLookup(lookup) },
      options
    )
    return githubRefreshOutcome(response.outcome)
  }

  async getPrChecks(
    input: {
      repo: string
      prNumber: number
      headSha?: string
      prRepo?: GitHubOwnerRepo
      noCache?: boolean
    },
    options?: RuntimeCallOptions
  ): Promise<PRCheckDetail[]> {
    const response = await this.call(
      'getPrChecks',
      GitHubServiceGetPrChecksRequestSchema,
      GitHubServiceGetPrChecksResponseSchema,
      {
        repo: input.repo,
        prNumber: BigInt(input.prNumber),
        headSha: input.headSha,
        prRepo: input.prRepo,
        noCache: input.noCache ?? false
      },
      options
    )
    return response.checks.map(githubCheckEntry)
  }

  async getPrCheckDetails(
    input: {
      repo: string
      checkRunId?: number
      workflowRunId?: number
      checkName?: string
      url?: string | null
      prRepo?: GitHubOwnerRepo
    },
    options?: RuntimeCallOptions
  ): Promise<PRCheckRunDetails | null> {
    const response = await this.call(
      'getPrCheckDetails',
      GitHubServiceGetPrCheckDetailsRequestSchema,
      GitHubServiceGetPrCheckDetailsResponseSchema,
      {
        repo: input.repo,
        checkRunId: input.checkRunId !== undefined ? BigInt(input.checkRunId) : undefined,
        workflowRunId: input.workflowRunId !== undefined ? BigInt(input.workflowRunId) : undefined,
        checkName: input.checkName,
        url: input.url ?? undefined,
        prRepo: input.prRepo
      },
      options
    )
    return githubCheckDetails(response.details)
  }

  async rerunPrChecks(
    input: {
      repo: string
      prNumber: number
      headSha?: string
      failedOnly?: boolean
      prRepo?: GitHubOwnerRepo
    },
    options?: RuntimeCallOptions
  ): Promise<GitHubRerunPRChecksResult> {
    const response = await this.call(
      'rerunPrChecks',
      GitHubServiceRerunPrChecksRequestSchema,
      GitHubServiceRerunPrChecksResponseSchema,
      {
        repo: input.repo,
        prNumber: BigInt(input.prNumber),
        headSha: input.headSha,
        failedOnly: input.failedOnly ?? false,
        prRepo: input.prRepo
      },
      options
    )
    return response.ok
      ? { ok: true, count: Number(response.count ?? 0n) }
      : { ok: false, error: response.error || 'Rerun failed' }
  }

  async getPrComments(
    input: { repo: string; prNumber: number; prRepo?: GitHubOwnerRepo; noCache?: boolean },
    options?: RuntimeCallOptions
  ): Promise<PRComment[]> {
    const response = await this.call(
      'getPrComments',
      GitHubServiceGetPrCommentsRequestSchema,
      GitHubServiceGetPrCommentsResponseSchema,
      {
        repo: input.repo,
        prNumber: BigInt(input.prNumber),
        prRepo: input.prRepo,
        noCache: input.noCache ?? false
      },
      options
    )
    return response.comments.map(githubComment)
  }

  async getPrFileContents(
    input: {
      repo: string
      path: string
      oldPath?: string
      status: GitHubPRFile['status']
      headSha: string
      baseSha: string
    },
    options?: RuntimeCallOptions
  ) {
    const response = await this.call(
      'getPrFileContents',
      GitHubServiceGetPrFileContentsRequestSchema,
      GitHubServiceGetPrFileContentsResponseSchema,
      {
        repo: input.repo,
        path: input.path,
        oldPath: input.oldPath,
        status: githubFileStatusInput(input.status),
        headSha: input.headSha,
        baseSha: input.baseSha
      },
      options
    )
    return {
      original: response.original,
      modified: response.modified,
      originalIsBinary: response.originalIsBinary,
      modifiedIsBinary: response.modifiedIsBinary,
      originalTooLarge: response.originalTooLarge,
      modifiedTooLarge: response.modifiedTooLarge
    }
  }
}
