import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  WorkspacePortsService,
  WorkspacePortsServiceEventSchema,
  WorkspacePortsServiceKillRequestSchema,
  WorkspacePortsServiceKillResponseSchema,
  WorkspacePortsServiceScanRequestSchema,
  WorkspacePortsServiceScanResponseSchema,
  WorkspacePortsServiceSubscribeEventsRequestSchema
} from '../generated/yiru/runtime/v1/workspace_ports_pb.js'
import type { RuntimeCallOptions, RuntimeStream, RuntimeTransport } from './transport.js'
import {
  decodeWorkspacePortEvent,
  decodeWorkspacePortKill,
  decodeWorkspacePortScan,
  type WorkspacePortKillResult,
  type WorkspacePortScanResult,
  type WorkspacePortSubscriptionEvent
} from './workspace-ports-values.js'

const SCAN_PROCEDURE = `/${WorkspacePortsService.typeName}/${WorkspacePortsService.method.scan.name}`
const KILL_PROCEDURE = `/${WorkspacePortsService.typeName}/${WorkspacePortsService.method.kill.name}`
const SUBSCRIBE_EVENTS_PROCEDURE = `/${WorkspacePortsService.typeName}/${WorkspacePortsService.method.subscribeEvents.name}`

export class WorkspacePortsClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async scan(repoId?: string, options?: RuntimeCallOptions): Promise<WorkspacePortScanResult> {
    const response = await this.transport.unary({
      method: SCAN_PROCEDURE,
      payload: toBinary(
        WorkspacePortsServiceScanRequestSchema,
        create(WorkspacePortsServiceScanRequestSchema, repoId ? { repoId } : {})
      ),
      ...(options ? { options } : {})
    })
    return decodeWorkspacePortScan(fromBinary(WorkspacePortsServiceScanResponseSchema, response))
  }

  async kill(
    args: { repoId?: string; pid: number; port: number },
    options?: RuntimeCallOptions
  ): Promise<WorkspacePortKillResult> {
    const response = await this.transport.unary({
      method: KILL_PROCEDURE,
      payload: toBinary(
        WorkspacePortsServiceKillRequestSchema,
        create(WorkspacePortsServiceKillRequestSchema, {
          ...(args.repoId ? { repoId: args.repoId } : {}),
          pid: args.pid,
          port: args.port
        })
      ),
      ...(options ? { options } : {})
    })
    return decodeWorkspacePortKill(fromBinary(WorkspacePortsServiceKillResponseSchema, response))
  }

  async subscribeEvents(options?: RuntimeCallOptions): Promise<WorkspacePortsEvents> {
    const stream = await this.transport.subscribe({
      method: SUBSCRIBE_EVENTS_PROCEDURE,
      payload: toBinary(
        WorkspacePortsServiceSubscribeEventsRequestSchema,
        create(WorkspacePortsServiceSubscribeEventsRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return { events: streamEvents(stream), cancel: stream.cancel }
  }
}

export type WorkspacePortsEvents = {
  events: AsyncIterable<WorkspacePortSubscriptionEvent>
  cancel: (reason?: string) => Promise<void>
}

async function* streamEvents(stream: RuntimeStream): AsyncIterable<WorkspacePortSubscriptionEvent> {
  for await (const payload of stream.events) {
    const event = decodeWorkspacePortEvent(fromBinary(WorkspacePortsServiceEventSchema, payload))
    if (event) {
      yield event
    }
  }
}
