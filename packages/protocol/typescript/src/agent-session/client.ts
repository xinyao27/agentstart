import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  AgentSessionService,
  AgentSessionServiceStartRequestSchema,
  AgentSessionServiceStartResponseSchema,
  AgentSessionServiceListRequestSchema,
  AgentSessionServiceListResponseSchema,
  AgentSessionServiceFollowupRequestSchema,
  AgentSessionServiceFollowupResponseSchema
} from '../../generated/yiru/runtime/v1/agent_session_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from '../transport.js'

export class AgentSessionClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async start(
    input: { agent: string; worktreeId: string; prompt?: string; title?: string },
    options?: RuntimeCallOptions
  ) {
    return fromBinary(
      AgentSessionServiceStartResponseSchema,
      await this.transport.unary({
        method: `/${AgentSessionService.typeName}/${AgentSessionService.method.start.name}`,
        payload: toBinary(
          AgentSessionServiceStartRequestSchema,
          create(AgentSessionServiceStartRequestSchema, input)
        ),
        ...(options ? { options } : {})
      })
    )
  }

  async list(input: { worktreeId?: string } = {}, options?: RuntimeCallOptions) {
    return fromBinary(
      AgentSessionServiceListResponseSchema,
      await this.transport.unary({
        method: `/${AgentSessionService.typeName}/${AgentSessionService.method.list.name}`,
        payload: toBinary(
          AgentSessionServiceListRequestSchema,
          create(AgentSessionServiceListRequestSchema, input)
        ),
        ...(options ? { options } : {})
      })
    )
  }

  async followup(input: { sessionId: string; prompt: string }, options?: RuntimeCallOptions) {
    return fromBinary(
      AgentSessionServiceFollowupResponseSchema,
      await this.transport.unary({
        method: `/${AgentSessionService.typeName}/${AgentSessionService.method.followup.name}`,
        payload: toBinary(
          AgentSessionServiceFollowupRequestSchema,
          create(AgentSessionServiceFollowupRequestSchema, input)
        ),
        ...(options ? { options } : {})
      })
    )
  }
}

export type { AgentSession } from '../../generated/yiru/runtime/v1/agent_session_pb.js'

export { AgentSessionStatus } from '../../generated/yiru/runtime/v1/agent_session_pb.js'
