import {
  GitRemoteService,
  GitRemoteServiceFastForwardRequestSchema,
  GitRemoteServiceFastForwardResponseSchema,
  GitRemoteServiceFetchRequestSchema,
  GitRemoteServiceFetchResponseSchema,
  GitRemoteServiceForkSyncRequestSchema,
  GitRemoteServiceForkSyncResponseSchema,
  GitRemoteServicePullRequestSchema,
  GitRemoteServicePullResponseSchema,
  GitRemoteServicePushRequestSchema,
  GitRemoteServicePushResponseSchema
} from '../../generated/agent_start/runtime/v1/git_remote_pb.js'
import type { RuntimeCallOptions } from '../transport.js'
import { GitHistoryClient } from './history-client.js'
import {
  gitForkSyncResultFromProto,
  type GitForkSyncExpectedUpstream,
  type GitForkSyncResult
} from './remote-values.js'
import { gitPushTargetToProto, type GitPushTarget } from './status-values.js'

function procedure(service: { typeName: string }, name: string): string {
  return `/${service.typeName}/${name}`
}

export class GitRemoteClient extends GitHistoryClient {
  async fetch(
    input: { worktree: string; pushTarget?: GitPushTarget },
    options?: RuntimeCallOptions
  ): Promise<void> {
    await this.unary(
      procedure(GitRemoteService, GitRemoteService.method.fetch.name),
      GitRemoteServiceFetchRequestSchema,
      { worktree: input.worktree, pushTarget: gitPushTargetToProto(input.pushTarget) },
      GitRemoteServiceFetchResponseSchema,
      options
    )
  }

  async pull(
    input: { worktree: string; pushTarget?: GitPushTarget },
    options?: RuntimeCallOptions
  ): Promise<void> {
    await this.unary(
      procedure(GitRemoteService, GitRemoteService.method.pull.name),
      GitRemoteServicePullRequestSchema,
      { worktree: input.worktree, pushTarget: gitPushTargetToProto(input.pushTarget) },
      GitRemoteServicePullResponseSchema,
      options
    )
  }

  async fastForward(
    input: { worktree: string; pushTarget?: GitPushTarget },
    options?: RuntimeCallOptions
  ): Promise<void> {
    await this.unary(
      procedure(GitRemoteService, GitRemoteService.method.fastForward.name),
      GitRemoteServiceFastForwardRequestSchema,
      { worktree: input.worktree, pushTarget: gitPushTargetToProto(input.pushTarget) },
      GitRemoteServiceFastForwardResponseSchema,
      options
    )
  }

  async push(
    input: {
      worktree: string
      pushTarget?: GitPushTarget
      publish?: boolean
      forceWithLease?: boolean
    },
    options?: RuntimeCallOptions
  ): Promise<void> {
    await this.unary(
      procedure(GitRemoteService, GitRemoteService.method.push.name),
      GitRemoteServicePushRequestSchema,
      {
        worktree: input.worktree,
        pushTarget: gitPushTargetToProto(input.pushTarget),
        publish: input.publish ?? false,
        forceWithLease: input.forceWithLease ?? false
      },
      GitRemoteServicePushResponseSchema,
      options
    )
  }

  async forkSync(
    input: { worktree: string; expectedUpstream: GitForkSyncExpectedUpstream },
    options?: RuntimeCallOptions
  ): Promise<GitForkSyncResult> {
    const response = await this.unary(
      procedure(GitRemoteService, GitRemoteService.method.forkSync.name),
      GitRemoteServiceForkSyncRequestSchema,
      {
        worktree: input.worktree,
        expectedUpstreamOwner: input.expectedUpstream.owner,
        expectedUpstreamRepo: input.expectedUpstream.repo
      },
      GitRemoteServiceForkSyncResponseSchema,
      options
    )
    return gitForkSyncResultFromProto(response)
  }
}
