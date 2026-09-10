import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  RateLimitResumeService,
  RateLimitResumeServiceCancelRequestSchema,
  RateLimitResumeServiceCancelResponseSchema,
  RateLimitResumeServiceInspectCodexRequestSchema,
  RateLimitResumeServiceInspectCodexResponseSchema,
  RateLimitResumeServiceListRequestSchema,
  RateLimitResumeServiceListResponseSchema,
  RateLimitResumeServiceMarkFailedRequestSchema,
  RateLimitResumeServiceMarkFailedResponseSchema,
  RateLimitResumeServiceMarkFiredRequestSchema,
  RateLimitResumeServiceMarkFiredResponseSchema,
  RateLimitResumeServiceMarkStaleRequestSchema,
  RateLimitResumeServiceMarkStaleResponseSchema,
  RateLimitResumeServiceRendererReadyRequestSchema,
  RateLimitResumeServiceRunNowRequestSchema,
  RateLimitResumeServiceRunNowResponseSchema,
  RateLimitResumeServiceScheduleRequestSchema,
  RateLimitResumeServiceScheduleResponseSchema,
  type RateLimitHit as ProtoHit,
  type RateLimitResumeSchedule as ProtoSchedule
} from '../generated/agent_start/runtime/v1/rate_limit_resume_pb.js'
import {
  protoProviderToString,
  protoStatusToString,
  protoWindowToString,
  stringToProtoProvider,
  stringToProtoWindow
} from './rate-limit-resume-values.js'
import type {
  CodexUsageLimitProbe,
  RateLimitHit,
  RateLimitResumeSchedule
} from './rate-limit-resume-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const INSPECT_CODEX_PROCEDURE = `/${RateLimitResumeService.typeName}/${RateLimitResumeService.method.inspectCodex.name}`
const LIST_PROCEDURE = `/${RateLimitResumeService.typeName}/${RateLimitResumeService.method.list.name}`
const SCHEDULE_PROCEDURE = `/${RateLimitResumeService.typeName}/${RateLimitResumeService.method.schedule.name}`
const CANCEL_PROCEDURE = `/${RateLimitResumeService.typeName}/${RateLimitResumeService.method.cancel.name}`
const RUN_NOW_PROCEDURE = `/${RateLimitResumeService.typeName}/${RateLimitResumeService.method.runNow.name}`
const MARK_FIRED_PROCEDURE = `/${RateLimitResumeService.typeName}/${RateLimitResumeService.method.markFired.name}`
const MARK_FAILED_PROCEDURE = `/${RateLimitResumeService.typeName}/${RateLimitResumeService.method.markFailed.name}`
const MARK_STALE_PROCEDURE = `/${RateLimitResumeService.typeName}/${RateLimitResumeService.method.markStale.name}`
const RENDERER_READY_PROCEDURE = `/${RateLimitResumeService.typeName}/${RateLimitResumeService.method.rendererReady.name}`

// Why: RateLimitResumeSchedule carries every RateLimitHit field plus schedule-specific ones
// on the wire, but the two are separate branded Message types; omitting $typeName lets a
// decoded schedule satisfy this structurally without duplicating the field list.
function hitFromProto(hit: Omit<ProtoHit, '$typeName'>): RateLimitHit {
  return {
    agent: hit.agent,
    ptyId: hit.ptyId,
    tabId: hit.tabId,
    paneKey: hit.paneKey,
    worktreeId: hit.worktreeId,
    prompt: hit.prompt,
    provider: protoProviderToString(hit.provider),
    detectedAt: hit.detectedAt,
    resetsAt: hit.resetsAt ?? null,
    resetDescription: hit.resetDescription ?? null,
    window: protoWindowToString(hit.window)
  }
}

export function scheduleFromProto(schedule: ProtoSchedule): RateLimitResumeSchedule {
  return {
    ...hitFromProto(schedule),
    id: schedule.id,
    resumeAt: schedule.resumeAt,
    status: protoStatusToString(schedule.status),
    createdAt: schedule.createdAt,
    firedAt: schedule.firedAt ?? null,
    failureReason: schedule.failureReason ?? null
  }
}

function requireSchedule(schedule: ProtoSchedule | undefined): ProtoSchedule {
  if (!schedule) {
    throw new Error('Invalid schedule response')
  }
  return schedule
}

export class RateLimitResumeClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async inspectCodex(
    probe: CodexUsageLimitProbe,
    options?: RuntimeCallOptions
  ): Promise<RateLimitHit | null> {
    const response = await this.transport.unary({
      method: INSPECT_CODEX_PROCEDURE,
      payload: toBinary(
        RateLimitResumeServiceInspectCodexRequestSchema,
        create(RateLimitResumeServiceInspectCodexRequestSchema, {
          ptyId: probe.ptyId,
          tabId: probe.tabId,
          paneKey: probe.paneKey,
          worktreeId: probe.worktreeId,
          sessionId: probe.sessionId,
          transcriptPath: probe.transcriptPath ?? '',
          turnId: probe.turnId,
          prompt: probe.prompt
        })
      ),
      ...(options ? { options } : {})
    })
    const hit = fromBinary(RateLimitResumeServiceInspectCodexResponseSchema, response).hit
    if (!hit || !hit.agent || !hit.ptyId || !hit.tabId || !hit.paneKey || !hit.worktreeId) {
      return null
    }
    return hitFromProto(hit)
  }

  async list(options?: RuntimeCallOptions): Promise<RateLimitResumeSchedule[]> {
    const response = await this.transport.unary({
      method: LIST_PROCEDURE,
      payload: toBinary(
        RateLimitResumeServiceListRequestSchema,
        create(RateLimitResumeServiceListRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    const list = fromBinary(RateLimitResumeServiceListResponseSchema, response)
    return list.schedules.map(scheduleFromProto)
  }

  async schedule(
    hit: RateLimitHit,
    options?: RuntimeCallOptions
  ): Promise<RateLimitResumeSchedule> {
    const response = await this.transport.unary({
      method: SCHEDULE_PROCEDURE,
      payload: toBinary(
        RateLimitResumeServiceScheduleRequestSchema,
        create(RateLimitResumeServiceScheduleRequestSchema, {
          agent: hit.agent,
          ptyId: hit.ptyId,
          tabId: hit.tabId,
          paneKey: hit.paneKey,
          worktreeId: hit.worktreeId,
          prompt: hit.prompt,
          provider: stringToProtoProvider(hit.provider),
          detectedAt: hit.detectedAt,
          resetsAt: hit.resetsAt ?? undefined,
          resetDescription: hit.resetDescription ?? '',
          window: stringToProtoWindow(hit.window)
        })
      ),
      ...(options ? { options } : {})
    })
    return scheduleFromProto(
      requireSchedule(fromBinary(RateLimitResumeServiceScheduleResponseSchema, response).schedule)
    )
  }

  async cancel(id: string, options?: RuntimeCallOptions): Promise<RateLimitResumeSchedule> {
    const response = await this.transport.unary({
      method: CANCEL_PROCEDURE,
      payload: toBinary(
        RateLimitResumeServiceCancelRequestSchema,
        create(RateLimitResumeServiceCancelRequestSchema, { id })
      ),
      ...(options ? { options } : {})
    })
    return scheduleFromProto(
      requireSchedule(fromBinary(RateLimitResumeServiceCancelResponseSchema, response).schedule)
    )
  }

  async runNow(id: string, options?: RuntimeCallOptions): Promise<RateLimitResumeSchedule> {
    const response = await this.transport.unary({
      method: RUN_NOW_PROCEDURE,
      payload: toBinary(
        RateLimitResumeServiceRunNowRequestSchema,
        create(RateLimitResumeServiceRunNowRequestSchema, { id })
      ),
      ...(options ? { options } : {})
    })
    return scheduleFromProto(
      requireSchedule(fromBinary(RateLimitResumeServiceRunNowResponseSchema, response).schedule)
    )
  }

  async markFired(id: string, options?: RuntimeCallOptions): Promise<RateLimitResumeSchedule> {
    const response = await this.transport.unary({
      method: MARK_FIRED_PROCEDURE,
      payload: toBinary(
        RateLimitResumeServiceMarkFiredRequestSchema,
        create(RateLimitResumeServiceMarkFiredRequestSchema, { id })
      ),
      ...(options ? { options } : {})
    })
    return scheduleFromProto(
      requireSchedule(fromBinary(RateLimitResumeServiceMarkFiredResponseSchema, response).schedule)
    )
  }

  async markFailed(
    id: string,
    reason: string,
    options?: RuntimeCallOptions
  ): Promise<RateLimitResumeSchedule> {
    const response = await this.transport.unary({
      method: MARK_FAILED_PROCEDURE,
      payload: toBinary(
        RateLimitResumeServiceMarkFailedRequestSchema,
        create(RateLimitResumeServiceMarkFailedRequestSchema, { id, reason })
      ),
      ...(options ? { options } : {})
    })
    return scheduleFromProto(
      requireSchedule(fromBinary(RateLimitResumeServiceMarkFailedResponseSchema, response).schedule)
    )
  }

  async markStale(id: string, options?: RuntimeCallOptions): Promise<RateLimitResumeSchedule> {
    const response = await this.transport.unary({
      method: MARK_STALE_PROCEDURE,
      payload: toBinary(
        RateLimitResumeServiceMarkStaleRequestSchema,
        create(RateLimitResumeServiceMarkStaleRequestSchema, { id })
      ),
      ...(options ? { options } : {})
    })
    return scheduleFromProto(
      requireSchedule(fromBinary(RateLimitResumeServiceMarkStaleResponseSchema, response).schedule)
    )
  }

  async rendererReady(options?: RuntimeCallOptions): Promise<void> {
    await this.transport.unary({
      method: RENDERER_READY_PROCEDURE,
      payload: toBinary(
        RateLimitResumeServiceRendererReadyRequestSchema,
        create(RateLimitResumeServiceRendererReadyRequestSchema, { connectionId: 'web' })
      ),
      ...(options ? { options } : {})
    })
  }
}
