import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  RitualKind as ProtocolKind,
  type RitualScheduleStatus as ProtocolScheduleStatus,
  type RitualServiceRunResponse as ProtocolRunResponse
} from '../generated/agent_start/runtime/v1/ritual_pb.js'
import { RuntimeProtocolError } from './error.js'

export const RITUAL_PROTOCOL_CAPABILITY = 'ritual.protobuf.v1' as const

export type RitualProjectResult = {
  detail: string
  projectId: string
  status: 'failed' | 'ready'
}

export type RitualSchedule = {
  archiveOnEndDay: boolean
  enabled: boolean
  endMinutes: number
  startMinutes: number
  timezone: string
  weekdays: number[]
}

export type RitualScheduleStatus = RitualSchedule & {
  lastEndAt: number | null
  lastFailure: string | null
  lastStartAt: number | null
}

export type RitualRunResult = {
  kind: 'end-day' | 'start-day'
  projects: RitualProjectResult[]
  summary: string
}

export type RitualRunKind = RitualRunResult['kind']

export function decodeRitualScheduleStatus(
  status: ProtocolScheduleStatus | undefined
): RitualScheduleStatus {
  if (!status) {
    throw invalidResponse('Ritual schedule status is missing')
  }
  return {
    archiveOnEndDay: status.archiveOnEndDay,
    enabled: status.enabled,
    endMinutes: status.endMinutes,
    startMinutes: status.startMinutes,
    timezone: status.timezone,
    weekdays: [...status.weekdays],
    lastEndAt: optionalMilliseconds(status.lastEndAt, 'Ritual last end'),
    lastFailure: status.lastFailure ?? null,
    lastStartAt: optionalMilliseconds(status.lastStartAt, 'Ritual last start')
  }
}

export function decodeRitualRunResult(response: ProtocolRunResponse): RitualRunResult {
  return {
    kind: runKind(response.kind),
    summary: response.summary,
    projects: response.projects.map((project) => ({
      projectId: project.projectId,
      // Why: the runner trait only guarantees "ready" and "failed" today, so
      // an unrecognized status degrades to the conservative non-ready value.
      status: project.status === 'ready' ? 'ready' : 'failed',
      detail: project.detail
    }))
  }
}

export function ritualKind(kind: RitualRunKind): ProtocolKind {
  return kind === 'start-day' ? ProtocolKind.START_DAY : ProtocolKind.END_DAY
}

function runKind(kind: ProtocolKind): RitualRunKind {
  switch (kind) {
    case ProtocolKind.START_DAY:
      return 'start-day'
    case ProtocolKind.END_DAY:
      return 'end-day'
    case ProtocolKind.UNSPECIFIED:
      throw invalidResponse('Ritual run kind is unspecified')
  }
}

function optionalMilliseconds(value: bigint | undefined, label: string): number | null {
  if (value === undefined) {
    return null
  }
  if (value < 0n) {
    throw invalidResponse(`${label} is negative`)
  }
  return Number(value)
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
