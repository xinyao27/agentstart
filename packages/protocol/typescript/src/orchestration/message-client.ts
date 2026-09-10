import { StatusCode } from '../../generated/agent_start/protocol/v1/errors_pb.js'
import {
  OrchestrationServiceCheckRequestSchema,
  OrchestrationServiceCheckResponseSchema,
  OrchestrationServiceDispatchRequestSchema,
  OrchestrationServiceDispatchResponseSchema,
  OrchestrationServiceDispatchShowRequestSchema,
  OrchestrationServiceDispatchShowResponseSchema,
  OrchestrationServiceInboxRequestSchema,
  OrchestrationServiceInboxResponseSchema,
  OrchestrationServiceReplyRequestSchema,
  OrchestrationServiceReplyResponseSchema,
  OrchestrationServiceSendRequestSchema,
  OrchestrationServiceSendResponseSchema
} from '../../generated/agent_start/runtime/v1/orchestration_pb.js'
import { RuntimeProtocolError } from '../error.js'
import type { RuntimeCallOptions } from '../transport.js'
import { messagePriorityValue, messageTypeValue } from './enum-values.js'
import {
  orchestrationDispatch,
  orchestrationLifecycleResult,
  orchestrationMessage,
  orchestrationMutation,
  orchestrationQuestion,
  orchestrationRelayAcceptance
} from './response-values.js'
import { OrchestrationTaskClient } from './task-client.js'
import type {
  OrchestrationDispatch,
  OrchestrationLifecycleResult,
  OrchestrationMessage,
  OrchestrationMessagePriorityName,
  OrchestrationMessageTypeName,
  OrchestrationMutation,
  OrchestrationQuestion,
  OrchestrationRelayAcceptance
} from './values.js'

export type OrchestrationDispatchOutcome =
  | { kind: 'dispatched'; dispatch: OrchestrationDispatch; injected: boolean; preamble?: string }
  | { kind: 'dryRun'; preamble: string }

export type OrchestrationSendOutcome =
  | { kind: 'message'; message: OrchestrationMessage; lifecycle?: OrchestrationLifecycleResult }
  | { kind: 'broadcast'; messages: OrchestrationMessage[]; recipients: number }
  | {
      kind: 'relay'
      relay: OrchestrationRelayAcceptance
      lifecycle?: { action: 'completed' | 'failed' }
    }

export class OrchestrationMessageClient extends OrchestrationTaskClient {
  async dispatch(
    input: {
      task: string
      to?: string
      from?: string
      inject?: boolean
      dryRun?: boolean
      returnPreamble?: boolean
      devMode?: boolean
      run?: string
    },
    options?: RuntimeCallOptions
  ): Promise<{ outcome: OrchestrationDispatchOutcome; mutation?: OrchestrationMutation }> {
    const response = await this.call(
      'dispatch',
      OrchestrationServiceDispatchRequestSchema,
      {
        ...input,
        inject: input.inject ?? false,
        dryRun: input.dryRun ?? false,
        returnPreamble: input.returnPreamble ?? false,
        devMode: input.devMode ?? false
      },
      OrchestrationServiceDispatchResponseSchema,
      options
    )
    const outcome = response.outcome
    if (outcome.case === 'dryRun') {
      return { outcome: { kind: 'dryRun', preamble: outcome.value.preamble } }
    }
    if (outcome.case === 'dispatched') {
      return {
        outcome: {
          kind: 'dispatched',
          dispatch: orchestrationDispatch(outcome.value.dispatch),
          injected: outcome.value.injected,
          ...(outcome.value.preamble ? { preamble: outcome.value.preamble } : {})
        },
        mutation: orchestrationMutation(response.mutation)
      }
    }
    throw new RuntimeProtocolError(
      StatusCode.DATA_LOSS,
      'Orchestration dispatch outcome is missing'
    )
  }

  /**
   * Jumps to a task's assignee terminal from a `task_...` scrollback token; the one call
   * terminal-orchestration-task-links.ts makes today.
   */
  async dispatchShow(
    input: { task: string; preamble?: boolean; from?: string; devMode?: boolean },
    options?: RuntimeCallOptions
  ): Promise<{ dispatch: OrchestrationDispatch | null; preamble?: string }> {
    const response = await this.call(
      'dispatchShow',
      OrchestrationServiceDispatchShowRequestSchema,
      { ...input, preamble: input.preamble ?? false, devMode: input.devMode ?? false },
      OrchestrationServiceDispatchShowResponseSchema,
      options
    )
    return {
      dispatch: response.dispatch ? orchestrationDispatch(response.dispatch) : null,
      ...(response.preamble ? { preamble: response.preamble } : {})
    }
  }

  async send(
    input: {
      to?: string
      subject: string
      from?: string
      body?: string
      type?: OrchestrationMessageTypeName
      priority?: OrchestrationMessagePriorityName
      threadId?: string
      payload?: string
      senderPaneKey?: string
      run?: string
      devMode?: boolean
      capability?: string
    },
    options?: RuntimeCallOptions
  ): Promise<{ outcome: OrchestrationSendOutcome; mutation?: OrchestrationMutation }> {
    const response = await this.call(
      'send',
      OrchestrationServiceSendRequestSchema,
      {
        ...input,
        type: messageTypeValue(input.type),
        priority: messagePriorityValue(input.priority),
        devMode: input.devMode ?? false
      },
      OrchestrationServiceSendResponseSchema,
      options
    )
    const outcome = response.outcome
    if (outcome.case === 'broadcast') {
      return {
        outcome: {
          kind: 'broadcast',
          messages: outcome.value.messages.map(orchestrationMessage),
          recipients: outcome.value.recipients
        },
        mutation: orchestrationMutation(response.mutation)
      }
    }
    if (outcome.case === 'relay') {
      const lifecycle = outcome.value.lifecycle
      return {
        outcome: {
          kind: 'relay',
          relay: orchestrationRelayAcceptance(outcome.value.relay),
          ...(lifecycle
            ? { lifecycle: { action: lifecycle.action === 1 ? 'completed' : 'failed' } }
            : {})
        },
        mutation: orchestrationMutation(response.mutation)
      }
    }
    if (outcome.case === 'message') {
      return {
        outcome: {
          kind: 'message',
          message: orchestrationMessage(outcome.value.message),
          lifecycle: orchestrationLifecycleResult(outcome.value.lifecycle)
        },
        mutation: orchestrationMutation(response.mutation)
      }
    }
    throw new RuntimeProtocolError(StatusCode.DATA_LOSS, 'Orchestration send outcome is missing')
  }

  /**
   * Holds the call open until a message arrives or `timeoutMs` elapses (default 30s, matching
   * CHECK_DEFAULT_TIMEOUT_MS in apps/daemon/src/orchestration/authority.rs); the caller's
   * transport-level deadline is padded past `timeoutMs` so it never fires first.
   */
  async check(
    input: {
      terminal?: string
      terminalPaneKey?: string
      unread?: boolean
      peek?: boolean
      all?: boolean
      types?: OrchestrationMessageTypeName[]
      format?: boolean
      inject?: boolean
      ack?: string
      run?: string
      wait?: boolean
      timeoutMs?: number
    } = {},
    options?: RuntimeCallOptions
  ): Promise<{
    messages: OrchestrationMessage[]
    count: number
    runId?: string
    dispatchId?: string
    deliveryId?: string | null
    replayed: boolean
    acknowledged?: string | null
    timedOut: boolean
    cancelled: boolean
    connectionLost: boolean
    formatted?: string
    mutation?: OrchestrationMutation
  }> {
    const response = await this.call(
      'check',
      OrchestrationServiceCheckRequestSchema,
      {
        ...input,
        unread: input.unread ?? false,
        peek: input.peek ?? false,
        all: input.all ?? false,
        types: (input.types ?? []).map(messageTypeValue).filter((value) => value !== undefined),
        format: input.format ?? false,
        inject: input.inject ?? false,
        wait: input.wait ?? false,
        timeoutMs: input.timeoutMs === undefined ? undefined : BigInt(input.timeoutMs)
      },
      OrchestrationServiceCheckResponseSchema,
      deadlinePadded(options, input.timeoutMs)
    )
    return {
      messages: response.messages.map(orchestrationMessage),
      count: Number(response.count),
      runId: response.runId,
      dispatchId: response.dispatchId,
      deliveryId: response.deliveryId ?? null,
      replayed: response.replayed,
      acknowledged: response.acknowledged ?? null,
      timedOut: response.timedOut,
      cancelled: response.cancelled,
      connectionLost: response.connectionLost,
      formatted: response.formatted,
      mutation: orchestrationMutation(response.mutation)
    }
  }

  async reply(
    input: { id: string; body: string; from?: string; run?: string },
    options?: RuntimeCallOptions
  ): Promise<{
    message: OrchestrationMessage
    question?: OrchestrationQuestion
    duplicate: boolean
    mutation?: OrchestrationMutation
  }> {
    const response = await this.call(
      'reply',
      OrchestrationServiceReplyRequestSchema,
      input,
      OrchestrationServiceReplyResponseSchema,
      options
    )
    return {
      message: orchestrationMessage(response.message),
      question: response.question ? orchestrationQuestion(response.question) : undefined,
      duplicate: response.duplicate,
      mutation: orchestrationMutation(response.mutation)
    }
  }

  async inbox(
    input: { limit?: number; terminal?: string } = {},
    options?: RuntimeCallOptions
  ): Promise<{ messages: OrchestrationMessage[]; count: number }> {
    const response = await this.call(
      'inbox',
      OrchestrationServiceInboxRequestSchema,
      { ...input, limit: input.limit === undefined ? undefined : BigInt(input.limit) },
      OrchestrationServiceInboxResponseSchema,
      options
    )
    return { messages: response.messages.map(orchestrationMessage), count: Number(response.count) }
  }
}

export function deadlinePadded(
  options: RuntimeCallOptions | undefined,
  timeoutMs: number | undefined
): RuntimeCallOptions | undefined {
  if (timeoutMs === undefined) {
    return options
  }
  const padded = timeoutMs + 5_000
  if (options?.timeoutMs !== undefined && options.timeoutMs >= padded) {
    return options
  }
  return { ...options, timeoutMs: padded }
}
