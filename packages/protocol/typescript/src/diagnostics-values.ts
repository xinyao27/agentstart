import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  DiagnosticsDisabledReason as ProtocolDisabledReason,
  type DiagnosticsServiceCollectBundleResponse,
  type DiagnosticsServiceGetStatusResponse,
  type DiagnosticsServiceUploadBundleResponse
} from '../generated/yiru/runtime/v1/diagnostics_pb.js'
import { RuntimeProtocolError } from './error.js'

export const DIAGNOSTICS_PROTOCOL_CAPABILITY = 'diagnostics.support.protobuf.v1' as const

export type DiagnosticsDisabledReason =
  | 'do_not_track'
  | 'yiru_telemetry_disabled'
  | 'yiru_diagnostics_disabled'
  | 'ci'

export type DiagnosticsStatus = {
  localFileEnabled: boolean
  bundleEnabled: boolean
  traceFilePath: string
  traceFamilySize: number
  disabledReason?: DiagnosticsDisabledReason
}

export type DiagnosticsBundle = {
  bundleSubmissionId: string
  bytes: number
  spanCount: number
}

export type DiagnosticsUploadResult = { ticketId: string } | { canceled: true }

export function diagnosticsStatus(
  response: DiagnosticsServiceGetStatusResponse
): DiagnosticsStatus {
  const traceFilePath = requiredText(response.traceFilePath, 'Diagnostics trace path is missing')
  const traceFamilySize = safeInteger(
    response.traceFamilySize,
    'Diagnostics trace family size is invalid'
  )
  const disabledReason =
    response.disabledReason === undefined
      ? undefined
      : diagnosticsDisabledReason(response.disabledReason)
  if (!response.bundleEnabled && !disabledReason) {
    throw invalidDiagnosticsResponse('Disabled diagnostics status has no reason')
  }
  if (response.bundleEnabled && disabledReason) {
    throw invalidDiagnosticsResponse('Enabled diagnostics status has a disabled reason')
  }
  return {
    localFileEnabled: response.localFileEnabled,
    bundleEnabled: response.bundleEnabled,
    traceFilePath,
    traceFamilySize,
    ...(disabledReason ? { disabledReason } : {})
  }
}

export function diagnosticsBundle(
  response: DiagnosticsServiceCollectBundleResponse
): DiagnosticsBundle {
  const bundleSubmissionId = requiredText(
    response.bundleSubmissionId,
    'Diagnostics bundle identity is missing'
  )
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(bundleSubmissionId)) {
    throw invalidDiagnosticsResponse('Diagnostics bundle identity is invalid')
  }
  const bytes = safeInteger(response.bytes, 'Diagnostics bundle byte length is invalid')
  if (bytes > 4 * 1024 * 1024) {
    throw invalidDiagnosticsResponse('Diagnostics bundle exceeds the protocol byte limit')
  }
  return {
    bundleSubmissionId,
    bytes,
    spanCount: response.spanCount
  }
}

export function diagnosticsUpload(
  response: DiagnosticsServiceUploadBundleResponse
): DiagnosticsUploadResult {
  if (response.result.case === 'canceled') {
    return { canceled: true }
  }
  if (response.result.case !== 'ticketId') {
    throw invalidDiagnosticsResponse('Diagnostics upload result is missing')
  }
  const ticketId = requiredText(response.result.value, 'Diagnostics ticket identity is missing')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ticketId)) {
    throw invalidDiagnosticsResponse('Diagnostics ticket identity is invalid')
  }
  return { ticketId }
}

export function diagnosticsLookbackMinutes(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined
  }
  return Math.max(1, Math.min(30 * 24 * 60, Math.floor(value)))
}

function diagnosticsDisabledReason(value: ProtocolDisabledReason): DiagnosticsDisabledReason {
  if (value === ProtocolDisabledReason.DO_NOT_TRACK) {
    return 'do_not_track'
  }
  if (value === ProtocolDisabledReason.YIRU_TELEMETRY_DISABLED) {
    return 'yiru_telemetry_disabled'
  }
  if (value === ProtocolDisabledReason.YIRU_DIAGNOSTICS_DISABLED) {
    return 'yiru_diagnostics_disabled'
  }
  if (value === ProtocolDisabledReason.CI) {
    return 'ci'
  }
  throw invalidDiagnosticsResponse('Diagnostics disabled reason is invalid')
}

function safeInteger(value: bigint, message: string): number {
  const numberValue = Number(value)
  if (!Number.isSafeInteger(numberValue) || numberValue < 0) {
    throw invalidDiagnosticsResponse(message)
  }
  return numberValue
}

function requiredText(value: string, message: string): string {
  if (!value || value !== value.trim() || hasControlCharacter(value)) {
    throw invalidDiagnosticsResponse(message)
  }
  return value
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) {
      return true
    }
  }
  return false
}

function invalidDiagnosticsResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
