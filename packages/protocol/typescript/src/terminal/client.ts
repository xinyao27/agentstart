import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  TerminalService,
  TerminalServiceOpenMultiplexRequestSchema,
  TerminalServiceOpenMultiplexResponseSchema
} from '../../generated/yiru/runtime/v1/terminal_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from '../transport.js'
import { TerminalManagedClient } from './managed-client.js'
import { required, safeInteger } from './request-values.js'

const OPEN_MULTIPLEX_PROCEDURE = `/${TerminalService.typeName}/${TerminalService.method.openMultiplex.name}`

// Wraps the one TerminalService protobuf service behind the client the
// namespace's capability (TERMINAL_PROTOCOL_CAPABILITY) advertises.
export class TerminalClient extends TerminalManagedClient {
  constructor(transport: RuntimeTransport) {
    super(transport)
  }

  async openMultiplex(
    input: { clientInstanceId: string; environmentId: string },
    options?: RuntimeCallOptions
  ): Promise<{
    bulkTicket: string
    expiresAt: number
    maxFrameBytes: number
  }> {
    const response = fromBinary(
      TerminalServiceOpenMultiplexResponseSchema,
      await this.transport.unary({
        method: OPEN_MULTIPLEX_PROCEDURE,
        payload: toBinary(
          TerminalServiceOpenMultiplexRequestSchema,
          create(TerminalServiceOpenMultiplexRequestSchema, {
            clientInstanceId: required(input.clientInstanceId, 'Terminal client instance ID'),
            environmentId: required(input.environmentId, 'Terminal environment ID')
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return {
      bulkTicket: response.bulkTicket,
      expiresAt: safeInteger(response.expiresAt, 'Terminal multiplex ticket expiry'),
      maxFrameBytes: response.maxFrameBytes
    }
  }
}

export const TERMINAL_PROTOCOL_CAPABILITY = `/${TerminalService.typeName}/${TerminalService.method.list.name}`
