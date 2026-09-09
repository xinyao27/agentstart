import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  WorkspaceCleanupDismissalSchema,
  WorkspaceCleanupService,
  WorkspaceCleanupServiceClearDismissalsRequestSchema,
  WorkspaceCleanupServiceDismissRequestSchema,
  WorkspaceCleanupServiceDismissalsResponseSchema,
  WorkspaceCleanupServiceEventSchema,
  WorkspaceCleanupServiceScanRequestSchema,
  WorkspaceCleanupServiceScanResponseSchema,
  WorkspaceCleanupServiceSubscribeEventsRequestSchema
} from '../generated/yiru/runtime/v1/workspace_cleanup_pb.js'
import type { RuntimeCallOptions, RuntimeStream, RuntimeTransport } from './transport.js'
import {
  decodeWorkspaceCleanupDismissals,
  decodeWorkspaceCleanupEvent,
  decodeWorkspaceCleanupScan,
  type WorkspaceCleanupDismissal,
  type WorkspaceCleanupEvent,
  type WorkspaceCleanupScanArgs,
  type WorkspaceCleanupScanResult
} from './workspace-cleanup-values.js'

const SCAN_PROCEDURE = `/${WorkspaceCleanupService.typeName}/${WorkspaceCleanupService.method.scan.name}`
const DISMISS_PROCEDURE = `/${WorkspaceCleanupService.typeName}/${WorkspaceCleanupService.method.dismiss.name}`
const CLEAR_DISMISSALS_PROCEDURE = `/${WorkspaceCleanupService.typeName}/${WorkspaceCleanupService.method.clearDismissals.name}`
const SUBSCRIBE_EVENTS_PROCEDURE = `/${WorkspaceCleanupService.typeName}/${WorkspaceCleanupService.method.subscribeEvents.name}`

export class WorkspaceCleanupClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async scan(
    args: WorkspaceCleanupScanArgs = {},
    options?: RuntimeCallOptions
  ): Promise<WorkspaceCleanupScanResult> {
    const response = await this.transport.unary({
      method: SCAN_PROCEDURE,
      payload: toBinary(
        WorkspaceCleanupServiceScanRequestSchema,
        create(WorkspaceCleanupServiceScanRequestSchema, {
          ...(args.scanId ? { scanId: args.scanId } : {}),
          skipGitWorktreeIds: [...(args.skipGitWorktreeIds ?? [])],
          ...(args.worktreeId ? { worktreeId: args.worktreeId } : {})
        })
      ),
      ...(options ? { options } : {})
    })
    return decodeWorkspaceCleanupScan(
      fromBinary(WorkspaceCleanupServiceScanResponseSchema, response)
    )
  }

  async dismiss(
    dismissals: readonly WorkspaceCleanupDismissal[],
    options?: RuntimeCallOptions
  ): Promise<Record<string, WorkspaceCleanupDismissal>> {
    const response = await this.transport.unary({
      method: DISMISS_PROCEDURE,
      payload: toBinary(
        WorkspaceCleanupServiceDismissRequestSchema,
        create(WorkspaceCleanupServiceDismissRequestSchema, {
          dismissals: dismissals.map((dismissal) =>
            create(WorkspaceCleanupDismissalSchema, {
              worktreeId: dismissal.worktreeId,
              dismissedAt: dismissal.dismissedAt,
              fingerprint: dismissal.fingerprint,
              classifierVersion: dismissal.classifierVersion
            })
          )
        })
      ),
      ...(options ? { options } : {})
    })
    return decodeWorkspaceCleanupDismissals(
      fromBinary(WorkspaceCleanupServiceDismissalsResponseSchema, response)
    )
  }

  async clearDismissals(
    options?: RuntimeCallOptions
  ): Promise<Record<string, WorkspaceCleanupDismissal>> {
    const response = await this.transport.unary({
      method: CLEAR_DISMISSALS_PROCEDURE,
      payload: toBinary(
        WorkspaceCleanupServiceClearDismissalsRequestSchema,
        create(WorkspaceCleanupServiceClearDismissalsRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return decodeWorkspaceCleanupDismissals(
      fromBinary(WorkspaceCleanupServiceDismissalsResponseSchema, response)
    )
  }

  async subscribeEvents(options?: RuntimeCallOptions): Promise<WorkspaceCleanupEvents> {
    const stream = await this.transport.subscribe({
      method: SUBSCRIBE_EVENTS_PROCEDURE,
      payload: toBinary(
        WorkspaceCleanupServiceSubscribeEventsRequestSchema,
        create(WorkspaceCleanupServiceSubscribeEventsRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return { events: streamEvents(stream), cancel: stream.cancel }
  }
}

export type WorkspaceCleanupEvents = {
  events: AsyncIterable<WorkspaceCleanupEvent>
  cancel: (reason?: string) => Promise<void>
}

async function* streamEvents(stream: RuntimeStream): AsyncIterable<WorkspaceCleanupEvent> {
  for await (const payload of stream.events) {
    const event = decodeWorkspaceCleanupEvent(
      fromBinary(WorkspaceCleanupServiceEventSchema, payload)
    )
    if (event) {
      yield event
    }
  }
}
