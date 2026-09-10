import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import { StatusCode } from '../../generated/agent_start/protocol/v1/errors_pb.js'
import {
  TerminalService,
  TerminalServiceMultiplexEventSchema,
  TerminalServiceMultiplexRequestSchema
} from '../../generated/agent_start/runtime/v1/terminal_pb.js'
import { RuntimeProtocolError } from '../error.js'
import type { RuntimeCallOptions, RuntimeDuplex, RuntimeDuplexTransport } from '../transport.js'

export const TERMINAL_MULTIPLEX_PROTOCOL_CAPABILITY = `/${TerminalService.typeName}/${TerminalService.method.multiplex.name}`

export type TerminalMultiplexEvent = { type: 'ready' } | { type: 'frame'; bytes: Uint8Array }
export type TerminalMultiplexConnection = {
  events: AsyncIterable<TerminalMultiplexEvent>
  sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => Promise<void>
  close: () => Promise<void>
}

export class TerminalMultiplexClient {
  private readonly transport: RuntimeDuplexTransport

  constructor(transport: RuntimeDuplexTransport) {
    this.transport = transport
  }

  async open(
    bulkTicket: string,
    options?: RuntimeCallOptions
  ): Promise<TerminalMultiplexConnection> {
    const stream = await this.transport.duplex({
      method: TERMINAL_MULTIPLEX_PROTOCOL_CAPABILITY,
      payload: toBinary(
        TerminalServiceMultiplexRequestSchema,
        create(TerminalServiceMultiplexRequestSchema, {
          content: { case: 'bulkTicket', value: bulkTicket }
        })
      ),
      ...(options ? { options } : {})
    })
    return {
      events: events(stream),
      sendBinary: (bytes) =>
        stream.send(
          toBinary(
            TerminalServiceMultiplexRequestSchema,
            create(TerminalServiceMultiplexRequestSchema, {
              content: { case: 'frame', value: new Uint8Array(bytes) }
            })
          )
        ),
      close: () => stream.cancel()
    }
  }
}

async function* events(stream: RuntimeDuplex): AsyncIterable<TerminalMultiplexEvent> {
  try {
    for await (const payload of stream.events) {
      const event = fromBinary(TerminalServiceMultiplexEventSchema, payload)
      switch (event.content.case) {
        case 'ready':
          yield { type: 'ready' }
          break
        case 'frame':
          yield { type: 'frame', bytes: event.content.value }
          break
        case undefined:
          throw new RuntimeProtocolError(StatusCode.DATA_LOSS, 'Terminal duplex event is missing')
      }
    }
  } finally {
    await stream.cancel()
  }
}
