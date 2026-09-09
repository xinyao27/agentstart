import { create, fromBinary, toBinary, type MessageInitShape } from '@bufbuild/protobuf'

import {
  WorktreeLabelsService,
  WorktreeLabelsServiceRegisterRequestSchema,
  WorktreeLabelsServiceRegisterResponseSchema
} from '../../generated/yiru/runtime/v1/worktree_labels_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from '../transport.js'

export class WorktreeLabelsClient {
  private readonly transport: RuntimeTransport
  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }
  async register(
    input: MessageInitShape<typeof WorktreeLabelsServiceRegisterRequestSchema> = {},
    options?: RuntimeCallOptions
  ) {
    return fromBinary(
      WorktreeLabelsServiceRegisterResponseSchema,
      await this.transport.unary({
        method: `/${WorktreeLabelsService.typeName}/${WorktreeLabelsService.method.register.name}`,
        payload: toBinary(
          WorktreeLabelsServiceRegisterRequestSchema,
          create(WorktreeLabelsServiceRegisterRequestSchema, input)
        ),
        ...(options ? { options } : {})
      })
    )
  }
}
