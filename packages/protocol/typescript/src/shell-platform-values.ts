import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  ShellPlatformOpenFailure,
  type ShellPlatformServiceOutcomeResponse
} from '../generated/yiru/runtime/v1/shell_platform_pb.js'
import { RuntimeProtocolError } from './error.js'

export const SHELL_PLATFORM_PROTOCOL_CAPABILITY = 'shell.platform.protobuf.v1' as const

// Why: the daemon answers open failures as an in-band `{ok, reason}` pair so
// callers can render inline failure states instead of catching RPC errors.
export type ShellPlatformOpenFailureValue =
  | 'not-absolute'
  | 'not-found'
  | 'launch-failed'
  | 'remote-runtime-unsupported'

export type ShellPlatformOutcomeValue =
  | { ok: true }
  | { ok: false; reason: ShellPlatformOpenFailureValue }

export type ShellPlatformOpenExternalEditorInput = {
  path: string
  command?: string
  connectionId?: string
}

export type ShellPlatformPickDirectoryInput = { defaultPath?: string }

export function shellPlatformOutcome(
  value: ShellPlatformServiceOutcomeResponse
): ShellPlatformOutcomeValue {
  if (value.ok) {
    return { ok: true }
  }
  return { ok: false, reason: openFailure(value.reason) }
}

function openFailure(value: ShellPlatformOpenFailure): ShellPlatformOpenFailureValue {
  switch (value) {
    case ShellPlatformOpenFailure.NOT_ABSOLUTE:
      return 'not-absolute'
    case ShellPlatformOpenFailure.NOT_FOUND:
      return 'not-found'
    case ShellPlatformOpenFailure.LAUNCH_FAILED:
      return 'launch-failed'
    case ShellPlatformOpenFailure.REMOTE_RUNTIME_UNSUPPORTED:
      return 'remote-runtime-unsupported'
    case ShellPlatformOpenFailure.UNSPECIFIED:
      break
  }
  throw invalidResponse('Shell platform open failure reason is missing')
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
