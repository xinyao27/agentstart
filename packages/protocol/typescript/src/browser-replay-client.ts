import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  BrowserReplayServiceListRequestSchema,
  BrowserReplayServiceListResponseSchema,
  BrowserReplayServiceRecordResultRequestSchema,
  BrowserReplayServiceRecordResultResponseSchema,
  BrowserReplayServiceSaveRequestSchema,
  BrowserReplayServiceSaveResponseSchema,
  BrowserReplayService
} from '../generated/yiru/runtime/v1/browser_replay_pb.js'
import {
  browserReplayRecording,
  encodeReplayEventKind,
  type BrowserReplayEvent,
  type BrowserReplayRecording
} from './browser-replay-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const LIST_PROCEDURE = `/${BrowserReplayService.typeName}/${BrowserReplayService.method.list.name}`
const RECORD_RESULT_PROCEDURE = `/${BrowserReplayService.typeName}/${BrowserReplayService.method.recordResult.name}`
const SAVE_PROCEDURE = `/${BrowserReplayService.typeName}/${BrowserReplayService.method.save.name}`

export class BrowserReplayClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async list(
    input: { limit?: number; projectId: string },
    options?: RuntimeCallOptions
  ): Promise<BrowserReplayRecording[]> {
    const response = await this.transport.unary({
      method: LIST_PROCEDURE,
      payload: toBinary(
        BrowserReplayServiceListRequestSchema,
        create(BrowserReplayServiceListRequestSchema, input)
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(BrowserReplayServiceListResponseSchema, response).recordings.map(
      (recording) => browserReplayRecording(recording)
    )
  }

  async recordResult(
    input: {
      detail: string
      pageUrl: string
      projectId: string
      recordingId: string
      success: boolean
      worktreeId: string
    },
    options?: RuntimeCallOptions
  ): Promise<{ eventId: bigint }> {
    const response = await this.transport.unary({
      method: RECORD_RESULT_PROCEDURE,
      payload: toBinary(
        BrowserReplayServiceRecordResultRequestSchema,
        create(BrowserReplayServiceRecordResultRequestSchema, input)
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(BrowserReplayServiceRecordResultResponseSchema, response)
  }

  async save(
    input: {
      endedAt: number
      events: BrowserReplayEvent[]
      pageTitle: string
      pageUrl: string
      projectId: string
      startedAt: number
      videoArtifactId?: string
    },
    options?: RuntimeCallOptions
  ): Promise<BrowserReplayRecording> {
    const response = await this.transport.unary({
      method: SAVE_PROCEDURE,
      payload: toBinary(
        BrowserReplayServiceSaveRequestSchema,
        create(BrowserReplayServiceSaveRequestSchema, {
          ...input,
          events: input.events.map((event) => ({
            at: event.at,
            key: event.key,
            kind: encodeReplayEventKind(event.kind),
            selector: event.selector,
            value: event.value
          }))
        })
      ),
      ...(options ? { options } : {})
    })
    return browserReplayRecording(
      fromBinary(BrowserReplayServiceSaveResponseSchema, response).recording
    )
  }
}
