import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  RitualService,
  RitualServiceGetScheduleRequestSchema,
  RitualServiceRunRequestSchema,
  RitualServiceRunResponseSchema,
  RitualServiceScheduleResponseSchema,
  RitualServiceSetScheduleRequestSchema,
  RitualScheduleSchema
} from '../generated/yiru/runtime/v1/ritual_pb.js'
import {
  decodeRitualRunResult,
  decodeRitualScheduleStatus,
  ritualKind,
  type RitualRunKind,
  type RitualRunResult,
  type RitualSchedule,
  type RitualScheduleStatus
} from './ritual-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const GET_SCHEDULE_PROCEDURE = `/${RitualService.typeName}/${RitualService.method.getSchedule.name}`
const SET_SCHEDULE_PROCEDURE = `/${RitualService.typeName}/${RitualService.method.setSchedule.name}`
const RUN_PROCEDURE = `/${RitualService.typeName}/${RitualService.method.run.name}`

export class RitualClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async getSchedule(options?: RuntimeCallOptions): Promise<RitualScheduleStatus> {
    const response = await this.transport.unary({
      method: GET_SCHEDULE_PROCEDURE,
      payload: toBinary(
        RitualServiceGetScheduleRequestSchema,
        create(RitualServiceGetScheduleRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return decodeRitualScheduleStatus(
      fromBinary(RitualServiceScheduleResponseSchema, response).schedule
    )
  }

  async setSchedule(
    schedule: RitualSchedule,
    options?: RuntimeCallOptions
  ): Promise<RitualScheduleStatus> {
    const response = await this.transport.unary({
      method: SET_SCHEDULE_PROCEDURE,
      payload: toBinary(
        RitualServiceSetScheduleRequestSchema,
        create(RitualServiceSetScheduleRequestSchema, {
          schedule: create(RitualScheduleSchema, {
            archiveOnEndDay: schedule.archiveOnEndDay,
            enabled: schedule.enabled,
            endMinutes: schedule.endMinutes,
            startMinutes: schedule.startMinutes,
            timezone: schedule.timezone,
            weekdays: [...schedule.weekdays]
          })
        })
      ),
      ...(options ? { options } : {})
    })
    return decodeRitualScheduleStatus(
      fromBinary(RitualServiceScheduleResponseSchema, response).schedule
    )
  }

  async run(kind: RitualRunKind, options?: RuntimeCallOptions): Promise<RitualRunResult> {
    const response = await this.transport.unary({
      method: RUN_PROCEDURE,
      payload: toBinary(
        RitualServiceRunRequestSchema,
        create(RitualServiceRunRequestSchema, { kind: ritualKind(kind) })
      ),
      ...(options ? { options } : {})
    })
    return decodeRitualRunResult(fromBinary(RitualServiceRunResponseSchema, response))
  }
}
