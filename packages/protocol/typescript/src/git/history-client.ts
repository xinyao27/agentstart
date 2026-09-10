import {
  GitHistoryRefScope,
  GitHistoryService,
  GitHistoryServiceBranchCompareRequestSchema,
  GitHistoryServiceBranchCompareResponseSchema,
  GitHistoryServiceBranchDiffRequestSchema,
  GitHistoryServiceBranchDiffResponseSchema,
  GitHistoryServiceCommitCompareRequestSchema,
  GitHistoryServiceCommitCompareResponseSchema,
  GitHistoryServiceCommitDiffRequestSchema,
  GitHistoryServiceCommitDiffResponseSchema,
  GitHistoryServiceHistoryRequestSchema,
  GitHistoryServiceHistoryResponseSchema
} from '../../generated/agent_start/runtime/v1/git_history_pb.js'
import type { RuntimeCallOptions } from '../transport.js'
import {
  gitBranchCompareResultFromProto,
  gitCommitCompareResultFromProto,
  type GitBranchCompareResult,
  type GitCommitCompareResult
} from './compare-values.js'
import { gitDiffResultFromProto, type GitDiffResult } from './diff-values.js'
import {
  gitHistoryResultFromProto,
  type GitHistoryOptions,
  type GitHistoryResult
} from './history-values.js'
import { GitHistoryRewriteClient } from './rewrite-client.js'

function procedure(service: { typeName: string }, name: string): string {
  return `/${service.typeName}/${name}`
}

function historyRefScopeToProto(scope: GitHistoryOptions['refScope']): GitHistoryRefScope {
  return scope === 'all' ? GitHistoryRefScope.ALL : GitHistoryRefScope.HEAD
}

export class GitHistoryClient extends GitHistoryRewriteClient {
  async history(
    input: { worktree: string } & GitHistoryOptions,
    options?: RuntimeCallOptions
  ): Promise<GitHistoryResult> {
    const response = await this.unary(
      procedure(GitHistoryService, GitHistoryService.method.history.name),
      GitHistoryServiceHistoryRequestSchema,
      {
        worktree: input.worktree,
        limit: input.limit,
        skip: input.skip,
        baseRef: input.baseRef ?? undefined,
        refScope: historyRefScopeToProto(input.refScope),
        includeRemoteBranches: input.includeRemoteBranches
      },
      GitHistoryServiceHistoryResponseSchema,
      options
    )
    return gitHistoryResultFromProto(response)
  }

  async branchCompare(
    input: { worktree: string; baseRef: string },
    options?: RuntimeCallOptions
  ): Promise<GitBranchCompareResult> {
    const response = await this.unary(
      procedure(GitHistoryService, GitHistoryService.method.branchCompare.name),
      GitHistoryServiceBranchCompareRequestSchema,
      input,
      GitHistoryServiceBranchCompareResponseSchema,
      options
    )
    if (!response.compare) {
      throw new Error('git_branch_compare_missing')
    }
    return gitBranchCompareResultFromProto(response.compare)
  }

  async commitCompare(
    input: { worktree: string; commitId: string },
    options?: RuntimeCallOptions
  ): Promise<GitCommitCompareResult> {
    const response = await this.unary(
      procedure(GitHistoryService, GitHistoryService.method.commitCompare.name),
      GitHistoryServiceCommitCompareRequestSchema,
      input,
      GitHistoryServiceCommitCompareResponseSchema,
      options
    )
    if (!response.compare) {
      throw new Error('git_commit_compare_missing')
    }
    return gitCommitCompareResultFromProto(response.compare)
  }

  async branchDiff(
    input: {
      worktree: string
      filePath: string
      oldPath?: string
      compare: { headOid: string; mergeBase: string }
    },
    options?: RuntimeCallOptions
  ): Promise<GitDiffResult> {
    const response = await this.unary(
      procedure(GitHistoryService, GitHistoryService.method.branchDiff.name),
      GitHistoryServiceBranchDiffRequestSchema,
      {
        worktree: input.worktree,
        filePath: input.filePath,
        oldPath: input.oldPath,
        mergeBase: input.compare.mergeBase,
        headOid: input.compare.headOid
      },
      GitHistoryServiceBranchDiffResponseSchema,
      options
    )
    if (!response.diff) {
      throw new Error('git_diff_missing')
    }
    return gitDiffResultFromProto(response.diff)
  }

  async commitDiff(
    input: {
      worktree: string
      filePath: string
      commitOid: string
      parentOid?: string | null
      oldPath?: string
    },
    options?: RuntimeCallOptions
  ): Promise<GitDiffResult> {
    const response = await this.unary(
      procedure(GitHistoryService, GitHistoryService.method.commitDiff.name),
      GitHistoryServiceCommitDiffRequestSchema,
      {
        worktree: input.worktree,
        filePath: input.filePath,
        commitOid: input.commitOid,
        parentOid: input.parentOid ?? undefined,
        oldPath: input.oldPath
      },
      GitHistoryServiceCommitDiffResponseSchema,
      options
    )
    if (!response.diff) {
      throw new Error('git_diff_missing')
    }
    return gitDiffResultFromProto(response.diff)
  }
}
