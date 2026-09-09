import { create, fromBinary, toBinary, type MessageInitShape } from '@bufbuild/protobuf'

import {
  FeedbackService,
  FeedbackServiceSubmitRequestSchema,
  FeedbackServiceSubmitResponseSchema
} from '../../generated/yiru/runtime/v1/feedback_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from '../transport.js'

export class FeedbackClient {
  private readonly transport: RuntimeTransport
  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }
  async submit(
    input: MessageInitShape<typeof FeedbackServiceSubmitRequestSchema> = {},
    options?: RuntimeCallOptions
  ) {
    return fromBinary(
      FeedbackServiceSubmitResponseSchema,
      await this.transport.unary({
        method: `/${FeedbackService.typeName}/${FeedbackService.method.submit.name}`,
        payload: toBinary(
          FeedbackServiceSubmitRequestSchema,
          create(FeedbackServiceSubmitRequestSchema, input)
        ),
        ...(options ? { options } : {})
      })
    )
  }
}
