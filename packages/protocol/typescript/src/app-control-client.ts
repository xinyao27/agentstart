import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  AppControlService,
  AppControlServiceRecordStartupDiagnosticRequestSchema,
  AppControlServiceRecordStartupDiagnosticResponseSchema,
  AppControlServiceRestartRequestSchema,
  AppControlServiceRestartResponseSchema
} from '../generated/agent_start/runtime/v1/app_control_pb.js'
import { RuntimeProtocolError } from './error.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const RESTART_PROCEDURE = `/${AppControlService.typeName}/${AppControlService.method.restart.name}`
const RECORD_STARTUP_DIAGNOSTIC_PROCEDURE = `/${AppControlService.typeName}/${AppControlService.method.recordStartupDiagnostic.name}`
const MAX_UINT32 = 0xffff_ffff
const MAX_EVENT_BYTES = 96
const STARTUP_EVENT_PATTERN = /^renderer-[A-Za-z0-9._:-]*$/

export const APP_CONTROL_PROTOCOL_CAPABILITY = 'appControl.protobuf.v1' as const

export type StartupDiagnostic = {
  event: string
  rendererElapsedMs?: number
  durationMs?: number
}

export class AppControlClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async restart(options?: RuntimeCallOptions): Promise<void> {
    const response = fromBinary(
      AppControlServiceRestartResponseSchema,
      await this.transport.unary({
        method: RESTART_PROCEDURE,
        payload: toBinary(
          AppControlServiceRestartRequestSchema,
          create(AppControlServiceRestartRequestSchema)
        ),
        ...(options ? { options } : {})
      })
    )
    if (!response.accepted) {
      throw invalidAppControlResponse('Runtime restart was not accepted')
    }
  }

  async recordStartupDiagnostic(
    diagnostic: StartupDiagnostic,
    options?: RuntimeCallOptions
  ): Promise<boolean> {
    validateStartupDiagnostic(diagnostic)
    const response = await this.transport.unary({
      method: RECORD_STARTUP_DIAGNOSTIC_PROCEDURE,
      payload: toBinary(
        AppControlServiceRecordStartupDiagnosticRequestSchema,
        create(AppControlServiceRecordStartupDiagnosticRequestSchema, diagnostic)
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(AppControlServiceRecordStartupDiagnosticResponseSchema, response).recorded
  }
}

function validateStartupDiagnostic(diagnostic: StartupDiagnostic): void {
  if (diagnostic.event.length > MAX_EVENT_BYTES || !STARTUP_EVENT_PATTERN.test(diagnostic.event)) {
    throw invalidAppControlInput('Startup diagnostic event is invalid')
  }
  validateOptionalDuration(diagnostic.rendererElapsedMs, 'rendererElapsedMs')
  validateOptionalDuration(diagnostic.durationMs, 'durationMs')
}

function validateOptionalDuration(value: number | undefined, field: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > MAX_UINT32)) {
    throw invalidAppControlInput(`Startup diagnostic ${field} is invalid`)
  }
}

function invalidAppControlInput(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.INVALID_ARGUMENT, message)
}

function invalidAppControlResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
