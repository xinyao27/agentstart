import {
  OrchestrationServiceAskRequestSchema,
  OrchestrationServiceAskResponseSchema,
  OrchestrationServiceGateCreateRequestSchema,
  OrchestrationServiceGateCreateResponseSchema,
  OrchestrationServiceGateListRequestSchema,
  OrchestrationServiceGateListResponseSchema,
  OrchestrationServiceGateResolveRequestSchema,
  OrchestrationServiceGateResolveResponseSchema
} from '../../generated/yiru/runtime/v1/orchestration_pb.js'
import type { RuntimeCallOptions } from '../transport.js'
import { gateStatusValue } from './enum-values.js'
import { OrchestrationMessageClient, deadlinePadded } from './message-client.js'
import { orchestrationGate, orchestrationMutation } from './response-values.js'
import type {
  OrchestrationGate,
  OrchestrationGateStatusName,
  OrchestrationMutation
} from './values.js'

export class OrchestrationGateClient extends OrchestrationMessageClient {
  /**
   * Blocks until answered, cancelled, or `timeoutMs` elapses (default 10 minutes, capped at 30 —
   * ASK_DEFAULT_TIMEOUT_MS/ASK_MAX_TIMEOUT_MS in the same authority module as check()).
   */
  async ask(
    input: {
      to?: string
      question?: string
      resume?: string
      options?: string
      timeoutMs?: number
      from?: string
      run?: string
      capability?: string
    },
    options?: RuntimeCallOptions
  ): Promise<{
    answer: string | null
    messageId: string
    answerMessageId?: string | null
    threadId: string
    timedOut: boolean
    cancelled: boolean
    connectionLost: boolean
    timeoutMs: number
    mutation?: OrchestrationMutation
  }> {
    const response = await this.call(
      'ask',
      OrchestrationServiceAskRequestSchema,
      { ...input, timeoutMs: input.timeoutMs === undefined ? undefined : BigInt(input.timeoutMs) },
      OrchestrationServiceAskResponseSchema,
      deadlinePadded(options, input.timeoutMs)
    )
    return {
      answer: response.answer ?? null,
      messageId: response.messageId,
      answerMessageId: response.answerMessageId ?? null,
      threadId: response.threadId,
      timedOut: response.timedOut,
      cancelled: response.cancelled,
      connectionLost: response.connectionLost,
      timeoutMs: Number(response.timeoutMs),
      mutation: orchestrationMutation(response.mutation)
    }
  }

  async gateCreate(
    input: { task: string; question: string; options?: string[] },
    options?: RuntimeCallOptions
  ): Promise<{ gate: OrchestrationGate; mutation?: OrchestrationMutation }> {
    const response = await this.call(
      'gateCreate',
      OrchestrationServiceGateCreateRequestSchema,
      { ...input, options: input.options ?? [] },
      OrchestrationServiceGateCreateResponseSchema,
      options
    )
    return {
      gate: orchestrationGate(response.gate),
      mutation: orchestrationMutation(response.mutation)
    }
  }

  async gateResolve(
    input: { id: string; resolution: string },
    options?: RuntimeCallOptions
  ): Promise<{ gate: OrchestrationGate; mutation?: OrchestrationMutation }> {
    const response = await this.call(
      'gateResolve',
      OrchestrationServiceGateResolveRequestSchema,
      input,
      OrchestrationServiceGateResolveResponseSchema,
      options
    )
    return {
      gate: orchestrationGate(response.gate),
      mutation: orchestrationMutation(response.mutation)
    }
  }

  async gateList(
    input: { task?: string; status?: OrchestrationGateStatusName } = {},
    options?: RuntimeCallOptions
  ): Promise<{ gates: OrchestrationGate[]; count: number }> {
    const response = await this.call(
      'gateList',
      OrchestrationServiceGateListRequestSchema,
      { ...input, status: gateStatusValue(input.status) },
      OrchestrationServiceGateListResponseSchema,
      options
    )
    return { gates: response.gates.map(orchestrationGate), count: Number(response.count) }
  }
}
