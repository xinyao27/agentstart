import { create, fromBinary, toBinary, type MessageInitShape } from '@bufbuild/protobuf'

import {
  StarNagShellService,
  StarNagShellServiceDismissRequestSchema,
  StarNagShellServiceDismissResponseSchema,
  StarNagShellServiceLaterRequestSchema,
  StarNagShellServiceLaterResponseSchema,
  StarNagShellServiceCompleteRequestSchema,
  StarNagShellServiceCompleteResponseSchema,
  StarNagShellServiceOpenWebRequestSchema,
  StarNagShellServiceOpenWebResponseSchema,
  StarNagShellServiceStarAgentStartRequestSchema,
  StarNagShellServiceStarAgentStartResponseSchema,
  StarNagShellServiceAgentValueMomentRequestSchema,
  StarNagShellServiceAgentValueMomentResponseSchema,
  StarNagShellServiceShowAgentValueMomentRequestSchema,
  StarNagShellServiceShowAgentValueMomentResponseSchema,
  StarNagShellServiceOnboardingCompletedRequestSchema,
  StarNagShellServiceOnboardingCompletedResponseSchema
} from '../../generated/agent_start/runtime/v1/star_nag_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from '../transport.js'

export class StarNagClient {
  private readonly transport: RuntimeTransport
  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }
  async dismiss(
    input: MessageInitShape<typeof StarNagShellServiceDismissRequestSchema> = {},
    options?: RuntimeCallOptions
  ) {
    return fromBinary(
      StarNagShellServiceDismissResponseSchema,
      await this.transport.unary({
        method: `/${StarNagShellService.typeName}/${StarNagShellService.method.dismiss.name}`,
        payload: toBinary(
          StarNagShellServiceDismissRequestSchema,
          create(StarNagShellServiceDismissRequestSchema, input)
        ),
        ...(options ? { options } : {})
      })
    )
  }
  async later(
    input: MessageInitShape<typeof StarNagShellServiceLaterRequestSchema> = {},
    options?: RuntimeCallOptions
  ) {
    return fromBinary(
      StarNagShellServiceLaterResponseSchema,
      await this.transport.unary({
        method: `/${StarNagShellService.typeName}/${StarNagShellService.method.later.name}`,
        payload: toBinary(
          StarNagShellServiceLaterRequestSchema,
          create(StarNagShellServiceLaterRequestSchema, input)
        ),
        ...(options ? { options } : {})
      })
    )
  }
  async complete(
    input: MessageInitShape<typeof StarNagShellServiceCompleteRequestSchema> = {},
    options?: RuntimeCallOptions
  ) {
    return fromBinary(
      StarNagShellServiceCompleteResponseSchema,
      await this.transport.unary({
        method: `/${StarNagShellService.typeName}/${StarNagShellService.method.complete.name}`,
        payload: toBinary(
          StarNagShellServiceCompleteRequestSchema,
          create(StarNagShellServiceCompleteRequestSchema, input)
        ),
        ...(options ? { options } : {})
      })
    )
  }
  async openWeb(
    input: MessageInitShape<typeof StarNagShellServiceOpenWebRequestSchema> = {},
    options?: RuntimeCallOptions
  ) {
    return fromBinary(
      StarNagShellServiceOpenWebResponseSchema,
      await this.transport.unary({
        method: `/${StarNagShellService.typeName}/${StarNagShellService.method.openWeb.name}`,
        payload: toBinary(
          StarNagShellServiceOpenWebRequestSchema,
          create(StarNagShellServiceOpenWebRequestSchema, input)
        ),
        ...(options ? { options } : {})
      })
    )
  }
  async starAgentStart(
    input: MessageInitShape<typeof StarNagShellServiceStarAgentStartRequestSchema> = {},
    options?: RuntimeCallOptions
  ) {
    return fromBinary(
      StarNagShellServiceStarAgentStartResponseSchema,
      await this.transport.unary({
        method: `/${StarNagShellService.typeName}/${StarNagShellService.method.starAgentStart.name}`,
        payload: toBinary(
          StarNagShellServiceStarAgentStartRequestSchema,
          create(StarNagShellServiceStarAgentStartRequestSchema, input)
        ),
        ...(options ? { options } : {})
      })
    )
  }
  async agentValueMoment(
    input: MessageInitShape<typeof StarNagShellServiceAgentValueMomentRequestSchema> = {},
    options?: RuntimeCallOptions
  ) {
    return fromBinary(
      StarNagShellServiceAgentValueMomentResponseSchema,
      await this.transport.unary({
        method: `/${StarNagShellService.typeName}/${StarNagShellService.method.agentValueMoment.name}`,
        payload: toBinary(
          StarNagShellServiceAgentValueMomentRequestSchema,
          create(StarNagShellServiceAgentValueMomentRequestSchema, input)
        ),
        ...(options ? { options } : {})
      })
    )
  }
  async showAgentValueMoment(
    input: MessageInitShape<typeof StarNagShellServiceShowAgentValueMomentRequestSchema> = {},
    options?: RuntimeCallOptions
  ) {
    return fromBinary(
      StarNagShellServiceShowAgentValueMomentResponseSchema,
      await this.transport.unary({
        method: `/${StarNagShellService.typeName}/${StarNagShellService.method.showAgentValueMoment.name}`,
        payload: toBinary(
          StarNagShellServiceShowAgentValueMomentRequestSchema,
          create(StarNagShellServiceShowAgentValueMomentRequestSchema, input)
        ),
        ...(options ? { options } : {})
      })
    )
  }
  async onboardingCompleted(
    input: MessageInitShape<typeof StarNagShellServiceOnboardingCompletedRequestSchema> = {},
    options?: RuntimeCallOptions
  ) {
    return fromBinary(
      StarNagShellServiceOnboardingCompletedResponseSchema,
      await this.transport.unary({
        method: `/${StarNagShellService.typeName}/${StarNagShellService.method.onboardingCompleted.name}`,
        payload: toBinary(
          StarNagShellServiceOnboardingCompletedRequestSchema,
          create(StarNagShellServiceOnboardingCompletedRequestSchema, input)
        ),
        ...(options ? { options } : {})
      })
    )
  }
}

export { StarNagPromptMode } from '../../generated/agent_start/runtime/v1/star_nag_pb.js'
