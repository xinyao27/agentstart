import {
  create,
  fromBinary,
  toBinary,
  type DescMessage,
  type MessageInitShape,
  type MessageShape
} from '@bufbuild/protobuf'

import {
  GitHubService,
  GitHubServiceGetRateLimitRequestSchema,
  GitHubServiceGetRateLimitResponseSchema,
  GitHubServiceGetRepoSlugRequestSchema,
  GitHubServiceGetRepoSlugResponseSchema,
  GitHubServiceGetRepoUpstreamRequestSchema,
  GitHubServiceGetRepoUpstreamResponseSchema,
  GitHubServiceGetWorkItemByOwnerRepoRequestSchema,
  GitHubServiceGetWorkItemByOwnerRepoResponseSchema,
  GitHubServiceGetWorkItemDetailsRequestSchema,
  GitHubServiceGetWorkItemDetailsResponseSchema,
  GitHubServiceGetWorkItemRequestSchema,
  GitHubServiceGetWorkItemResponseSchema,
  GitHubServiceListAssignableUsersRequestSchema,
  GitHubServiceListAssignableUsersResponseSchema,
  GitHubServiceListLabelsRequestSchema,
  GitHubServiceListLabelsResponseSchema,
  GitHubServiceListWorkItemsRequestSchema,
  GitHubServiceListWorkItemsResponseSchema
} from '../../generated/agent_start/runtime/v1/github_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from '../transport.js'
import { githubRateLimit, type GetRateLimitResult } from './rate-limit-values.js'
import { githubOwnerRepo, user, type GitHubOwnerRepo } from './values.js'
import {
  githubWorkItem,
  githubWorkItemDetails,
  type GitHubWorkItem,
  type GitHubWorkItemDetails
} from './work-item-values.js'

const SERVICE = GitHubService.typeName
function procedure(name: keyof typeof GitHubService.method): string {
  return `/${SERVICE}/${GitHubService.method[name].name}`
}

export class GitHubRepoClient {
  protected readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  protected async call<ReqDesc extends DescMessage, ResDesc extends DescMessage>(
    name: keyof typeof GitHubService.method,
    requestSchema: ReqDesc,
    responseSchema: ResDesc,
    input: MessageInitShape<ReqDesc>,
    options?: RuntimeCallOptions
  ): Promise<MessageShape<ResDesc>> {
    const response = await this.transport.unary({
      method: procedure(name),
      payload: toBinary(requestSchema, create(requestSchema, input)),
      ...(options ? { options } : {})
    })
    return fromBinary(responseSchema, response)
  }

  async getRepoSlug(repo: string, options?: RuntimeCallOptions): Promise<GitHubOwnerRepo | null> {
    const response = await this.call(
      'getRepoSlug',
      GitHubServiceGetRepoSlugRequestSchema,
      GitHubServiceGetRepoSlugResponseSchema,
      { repo },
      options
    )
    return githubOwnerRepo(response.repo)
  }

  async getRepoUpstream(
    repo: string,
    options?: RuntimeCallOptions
  ): Promise<GitHubOwnerRepo | null> {
    const response = await this.call(
      'getRepoUpstream',
      GitHubServiceGetRepoUpstreamRequestSchema,
      GitHubServiceGetRepoUpstreamResponseSchema,
      { repo },
      options
    )
    return githubOwnerRepo(response.upstream)
  }

  async getRateLimit(force = false, options?: RuntimeCallOptions): Promise<GetRateLimitResult> {
    const response = await this.call(
      'getRateLimit',
      GitHubServiceGetRateLimitRequestSchema,
      GitHubServiceGetRateLimitResponseSchema,
      { force },
      options
    )
    return githubRateLimit(response)
  }

  async listWorkItems(
    input: { repo: string; limit?: number; page?: number; query?: string },
    options?: RuntimeCallOptions
  ): Promise<{ items: GitHubWorkItem[]; source: GitHubOwnerRepo | null }> {
    const response = await this.call(
      'listWorkItems',
      GitHubServiceListWorkItemsRequestSchema,
      GitHubServiceListWorkItemsResponseSchema,
      {
        repo: input.repo,
        limit: BigInt(input.limit ?? 30),
        page: BigInt(input.page ?? 1),
        query: input.query
      },
      options
    )
    return { items: response.items.map(githubWorkItem), source: githubOwnerRepo(response.source) }
  }

  async listLabels(repo: string, options?: RuntimeCallOptions): Promise<string[]> {
    const response = await this.call(
      'listLabels',
      GitHubServiceListLabelsRequestSchema,
      GitHubServiceListLabelsResponseSchema,
      { repo },
      options
    )
    return response.labels
  }

  async listAssignableUsers(repo: string, options?: RuntimeCallOptions) {
    const response = await this.call(
      'listAssignableUsers',
      GitHubServiceListAssignableUsersRequestSchema,
      GitHubServiceListAssignableUsersResponseSchema,
      { repo },
      options
    )
    return response.users.map(user)
  }

  async getWorkItem(
    repo: string,
    number: number,
    options?: RuntimeCallOptions
  ): Promise<GitHubWorkItem | null> {
    const response = await this.call(
      'getWorkItem',
      GitHubServiceGetWorkItemRequestSchema,
      GitHubServiceGetWorkItemResponseSchema,
      { repo, number: BigInt(number) },
      options
    )
    return response.item ? githubWorkItem(response.item) : null
  }

  async getWorkItemByOwnerRepo(
    repo: string,
    number: number,
    ownerRepo: GitHubOwnerRepo,
    options?: RuntimeCallOptions
  ): Promise<GitHubWorkItem | null> {
    const response = await this.call(
      'getWorkItemByOwnerRepo',
      GitHubServiceGetWorkItemByOwnerRepoRequestSchema,
      GitHubServiceGetWorkItemByOwnerRepoResponseSchema,
      { repo, number: BigInt(number), ownerRepo },
      options
    )
    return response.item ? githubWorkItem(response.item) : null
  }

  async getWorkItemDetails(
    repo: string,
    number: number,
    options?: RuntimeCallOptions
  ): Promise<GitHubWorkItemDetails | null> {
    const response = await this.call(
      'getWorkItemDetails',
      GitHubServiceGetWorkItemDetailsRequestSchema,
      GitHubServiceGetWorkItemDetailsResponseSchema,
      { repo, number: BigInt(number) },
      options
    )
    return githubWorkItemDetails(response.details)
  }
}
