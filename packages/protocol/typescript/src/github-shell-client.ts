import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  GitHubShellServiceCheckAgentStartStarredRequestSchema,
  GitHubShellServiceCheckAgentStartStarredResponseSchema,
  GitHubShellServiceEnqueuePrRefreshRequestSchema,
  GitHubShellServiceEnqueuePrRefreshResponseSchema,
  GitHubShellServiceGetViewerRequestSchema,
  GitHubShellServiceGetViewerResponseSchema,
  GitHubShellServiceReportVisiblePrRefreshCandidatesRequestSchema,
  GitHubShellServiceReportVisiblePrRefreshCandidatesResponseSchema,
  GitHubShellServiceStarAgentStartRequestSchema,
  GitHubShellServiceStarAgentStartResponseSchema,
  GitHubShellService
} from '../generated/agent_start/runtime/v1/github_shell_pb.js'
import {
  type AppStarSource,
  enqueueResult,
  type GitHubPrRefreshCandidate,
  type GitHubPrRefreshEnqueueResult,
  type GitHubPrRefreshReason,
  type GitHubViewer,
  githubViewer,
  protocolCandidate,
  protocolRefreshReason,
  protocolStarSource
} from './github-shell-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const GET_VIEWER_PROCEDURE = `/${GitHubShellService.typeName}/${GitHubShellService.method.getViewer.name}`
const ENQUEUE_PROCEDURE = `/${GitHubShellService.typeName}/${GitHubShellService.method.enqueuePrRefresh.name}`
const REPORT_VISIBLE_PROCEDURE = `/${GitHubShellService.typeName}/${GitHubShellService.method.reportVisiblePrRefreshCandidates.name}`
const CHECK_STARRED_PROCEDURE = `/${GitHubShellService.typeName}/${GitHubShellService.method.checkAgentStartStarred.name}`
const STAR_PROCEDURE = `/${GitHubShellService.typeName}/${GitHubShellService.method.starAgentStart.name}`

export class GitHubShellClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async getViewer(options?: RuntimeCallOptions): Promise<GitHubViewer | null> {
    const response = await this.transport.unary({
      method: GET_VIEWER_PROCEDURE,
      payload: toBinary(
        GitHubShellServiceGetViewerRequestSchema,
        create(GitHubShellServiceGetViewerRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return githubViewer(fromBinary(GitHubShellServiceGetViewerResponseSchema, response).viewer)
  }

  async enqueuePrRefresh(
    input: {
      candidate: GitHubPrRefreshCandidate
      reason: GitHubPrRefreshReason
      priority?: number
    },
    options?: RuntimeCallOptions
  ): Promise<GitHubPrRefreshEnqueueResult | false> {
    const response = await this.transport.unary({
      method: ENQUEUE_PROCEDURE,
      payload: toBinary(
        GitHubShellServiceEnqueuePrRefreshRequestSchema,
        create(GitHubShellServiceEnqueuePrRefreshRequestSchema, {
          candidate: protocolCandidate(input.candidate),
          reason: protocolRefreshReason(input.reason),
          ...(input.priority === undefined ? {} : { priority: priority(input.priority) })
        })
      ),
      ...(options ? { options } : {})
    })
    return enqueueResult(fromBinary(GitHubShellServiceEnqueuePrRefreshResponseSchema, response))
  }

  async reportVisiblePrRefreshCandidates(
    input: { candidates: GitHubPrRefreshCandidate[]; generation: number },
    options?: RuntimeCallOptions
  ): Promise<boolean> {
    const response = await this.transport.unary({
      method: REPORT_VISIBLE_PROCEDURE,
      payload: toBinary(
        GitHubShellServiceReportVisiblePrRefreshCandidatesRequestSchema,
        create(GitHubShellServiceReportVisiblePrRefreshCandidatesRequestSchema, {
          candidates: input.candidates.map(protocolCandidate),
          generation: generation(input.generation)
        })
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(GitHubShellServiceReportVisiblePrRefreshCandidatesResponseSchema, response)
      .accepted
  }

  async checkAgentStartStarred(options?: RuntimeCallOptions): Promise<boolean | null> {
    const response = await this.transport.unary({
      method: CHECK_STARRED_PROCEDURE,
      payload: toBinary(
        GitHubShellServiceCheckAgentStartStarredRequestSchema,
        create(GitHubShellServiceCheckAgentStartStarredRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return (
      fromBinary(GitHubShellServiceCheckAgentStartStarredResponseSchema, response).starred ?? null
    )
  }

  async starAgentStart(source: AppStarSource, options?: RuntimeCallOptions): Promise<boolean> {
    const response = await this.transport.unary({
      method: STAR_PROCEDURE,
      payload: toBinary(
        GitHubShellServiceStarAgentStartRequestSchema,
        create(GitHubShellServiceStarAgentStartRequestSchema, {
          source: protocolStarSource(source)
        })
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(GitHubShellServiceStarAgentStartResponseSchema, response).starred
  }
}

function priority(value: number): number {
  if (!Number.isInteger(value) || value < -2_147_483_648 || value > 2_147_483_647) {
    throw new TypeError('GitHub PR refresh priority must be a signed 32-bit integer')
  }
  return value
}

function generation(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('GitHub PR refresh generation must be a nonnegative safe integer')
  }
  return value
}
