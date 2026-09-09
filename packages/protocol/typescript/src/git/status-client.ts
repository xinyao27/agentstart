import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import type { DescMessage, MessageInitShape, MessageShape } from '@bufbuild/protobuf'

import { GitStatusArea } from '../../generated/yiru/runtime/v1/git_common_pb.js'
import {
  GitStatusService,
  GitStatusServiceCheckIgnoredRequestSchema,
  GitStatusServiceCheckIgnoredResponseSchema,
  GitStatusServiceDiffRequestSchema,
  GitStatusServiceDiffResponseSchema,
  GitStatusServiceFindHugeFoldersToIgnoreRequestSchema,
  GitStatusServiceFindHugeFoldersToIgnoreResponseSchema,
  GitStatusServiceLocalBranchesRequestSchema,
  GitStatusServiceLocalBranchesResponseSchema,
  GitStatusServiceRemoteCommitUrlRequestSchema,
  GitStatusServiceRemoteCommitUrlResponseSchema,
  GitStatusServiceStatusRequestSchema,
  GitStatusServiceStatusResponseSchema,
  GitStatusServiceSubmoduleStatusRequestSchema,
  GitStatusServiceSubmoduleStatusResponseSchema,
  GitStatusServiceUpstreamStatusRequestSchema,
  GitStatusServiceUpstreamStatusResponseSchema
} from '../../generated/yiru/runtime/v1/git_status_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from '../transport.js'
import { gitDiffResultFromProto, type GitDiffResult } from './diff-values.js'
import {
  gitUpstreamStatusFromProto,
  gitWorkingStatusFromProto,
  gitPushTargetToProto,
  type GitPushTarget,
  type GitStatusResult,
  type GitStagingArea
} from './status-values.js'

function procedure(service: { typeName: string }, name: string): string {
  return `/${service.typeName}/${name}`
}

function stagingAreaToProto(area: GitStagingArea): GitStatusArea {
  switch (area) {
    case 'staged':
      return GitStatusArea.STAGED
    case 'untracked':
      return GitStatusArea.UNTRACKED
    default:
      return GitStatusArea.UNSTAGED
  }
}

// Wraps the seven GitService protobuf services (status, staging, branch,
// history, remote, history-rewrite, generation) behind the one client the
// namespace's capability (GIT_PROTOCOL_CAPABILITY) advertises, mirroring the
// method names apps/daemon/src/rpc/git.rs used to expose over JSON RPC.
export class GitStatusClient {
  protected readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  protected async unary<ReqDesc extends DescMessage, ResDesc extends DescMessage>(
    procedureName: string,
    requestSchema: ReqDesc,
    request: MessageInitShape<ReqDesc>,
    responseSchema: ResDesc,
    options?: RuntimeCallOptions
  ): Promise<MessageShape<ResDesc>> {
    const response = await this.transport.unary({
      method: procedureName,
      payload: toBinary(requestSchema, create(requestSchema, request)),
      ...(options ? { options } : {})
    })
    return fromBinary(responseSchema, response)
  }

  async status(
    input: {
      worktree: string
      includeIgnored?: boolean
      bypassNegativeCache?: boolean
      reuseLineStats?: boolean
    },
    options?: RuntimeCallOptions
  ): Promise<GitStatusResult> {
    const response = await this.unary(
      procedure(GitStatusService, GitStatusService.method.status.name),
      GitStatusServiceStatusRequestSchema,
      {
        worktree: input.worktree,
        includeIgnored: input.includeIgnored ?? false,
        bypassNegativeCache: input.bypassNegativeCache ?? false,
        reuseLineStats: input.reuseLineStats ?? false
      },
      GitStatusServiceStatusResponseSchema,
      options
    )
    if (!response.status) {
      throw new Error('git_status_missing')
    }
    return gitWorkingStatusFromProto(response.status)
  }

  async diff(
    input: { worktree: string; filePath: string; staged?: boolean; compareAgainstHead?: boolean },
    options?: RuntimeCallOptions
  ): Promise<GitDiffResult> {
    const response = await this.unary(
      procedure(GitStatusService, GitStatusService.method.diff.name),
      GitStatusServiceDiffRequestSchema,
      {
        worktree: input.worktree,
        filePath: input.filePath,
        staged: input.staged ?? false,
        compareAgainstHead: input.compareAgainstHead ?? false
      },
      GitStatusServiceDiffResponseSchema,
      options
    )
    if (!response.diff) {
      throw new Error('git_diff_missing')
    }
    return gitDiffResultFromProto(response.diff)
  }

  async submoduleStatus(
    input: { worktree: string; submodulePath: string; area?: GitStagingArea },
    options?: RuntimeCallOptions
  ): Promise<GitStatusResult> {
    const response = await this.unary(
      procedure(GitStatusService, GitStatusService.method.submoduleStatus.name),
      GitStatusServiceSubmoduleStatusRequestSchema,
      {
        worktree: input.worktree,
        submodulePath: input.submodulePath,
        area: stagingAreaToProto(input.area ?? 'unstaged')
      },
      GitStatusServiceSubmoduleStatusResponseSchema,
      options
    )
    if (!response.status) {
      throw new Error('git_status_missing')
    }
    return gitWorkingStatusFromProto(response.status)
  }

  async checkIgnored(
    input: { worktree: string; paths: string[] },
    options?: RuntimeCallOptions
  ): Promise<string[]> {
    const response = await this.unary(
      procedure(GitStatusService, GitStatusService.method.checkIgnored.name),
      GitStatusServiceCheckIgnoredRequestSchema,
      input,
      GitStatusServiceCheckIgnoredResponseSchema,
      options
    )
    return response.ignoredPaths
  }

  async findHugeFoldersToIgnore(
    input: { worktree: string },
    options?: RuntimeCallOptions
  ): Promise<string[]> {
    const response = await this.unary(
      procedure(GitStatusService, GitStatusService.method.findHugeFoldersToIgnore.name),
      GitStatusServiceFindHugeFoldersToIgnoreRequestSchema,
      input,
      GitStatusServiceFindHugeFoldersToIgnoreResponseSchema,
      options
    )
    return response.folders
  }

  async localBranches(
    input: { worktree: string },
    options?: RuntimeCallOptions
  ): Promise<{ current: string | null; branches: string[] }> {
    const response = await this.unary(
      procedure(GitStatusService, GitStatusService.method.localBranches.name),
      GitStatusServiceLocalBranchesRequestSchema,
      input,
      GitStatusServiceLocalBranchesResponseSchema,
      options
    )
    return { current: response.current ?? null, branches: response.branches }
  }

  async upstreamStatus(
    input: { worktree: string; pushTarget?: GitPushTarget },
    options?: RuntimeCallOptions
  ): Promise<ReturnType<typeof gitUpstreamStatusFromProto>> {
    const response = await this.unary(
      procedure(GitStatusService, GitStatusService.method.upstreamStatus.name),
      GitStatusServiceUpstreamStatusRequestSchema,
      { worktree: input.worktree, pushTarget: gitPushTargetToProto(input.pushTarget) },
      GitStatusServiceUpstreamStatusResponseSchema,
      options
    )
    if (!response.upstreamStatus) {
      throw new Error('git_upstream_status_missing')
    }
    return gitUpstreamStatusFromProto(response.upstreamStatus)
  }

  async remoteCommitUrl(
    input: { worktree: string; sha: string },
    options?: RuntimeCallOptions
  ): Promise<string | null> {
    const response = await this.unary(
      procedure(GitStatusService, GitStatusService.method.remoteCommitUrl.name),
      GitStatusServiceRemoteCommitUrlRequestSchema,
      input,
      GitStatusServiceRemoteCommitUrlResponseSchema,
      options
    )
    return response.url ?? null
  }
}
