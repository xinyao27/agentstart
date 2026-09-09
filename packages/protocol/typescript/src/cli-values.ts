import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  CliInstallMethod as ProtocolCliInstallMethod,
  CliInstallState as ProtocolCliInstallState,
  CliInstallUnsupportedReason as ProtocolCliInstallUnsupportedReason,
  type CliInstallStatus as ProtocolCliInstallStatus
} from '../generated/yiru/runtime/v1/cli_pb.js'
import { HostPlatform } from '../generated/yiru/runtime/v1/host_registry_pb.js'
import { RuntimeProtocolError } from './error.js'

export const CLI_WSL_PROTOCOL_CAPABILITY = 'cli.wsl.protobuf.v1' as const
export const CLI_PROTOCOL_CAPABILITY = 'cli.protobuf.v1' as const

export type CliInstallPlatform = 'darwin' | 'linux' | 'win32' | 'unknown'

export type CliInstallState = 'installed' | 'not_installed' | 'stale' | 'conflict' | 'unsupported'

export type CliInstallUnsupportedReason =
  | 'platform_not_supported'
  | 'launcher_missing'
  | 'launch_mode_unavailable'

export type CliInstallMethod = 'symlink' | 'wrapper'

export type CliInstallStatus = {
  platform: CliInstallPlatform
  commandName: string
  commandPath: string | null
  pathDirectory: string | null
  pathConfigured: boolean
  launcherPath: string | null
  installMethod: CliInstallMethod | null
  supported: boolean
  state: CliInstallState
  currentTarget: string | null
  unsupportedReason: CliInstallUnsupportedReason | null
  detail: string | null
}

export function cliInstallStatus(status: ProtocolCliInstallStatus | undefined): CliInstallStatus {
  if (!status) {
    throw invalidResponse('CLI install status is missing')
  }
  if (status.platform !== HostPlatform.LINUX) {
    throw invalidResponse('WSL CLI install status platform is invalid')
  }
  return decodedCliInstallStatus(status, 'linux')
}

export function localCliInstallStatus(
  status: ProtocolCliInstallStatus | undefined
): CliInstallStatus {
  if (!status) {
    throw invalidResponse('CLI install status is missing')
  }
  return decodedCliInstallStatus(status, hostPlatformName(status.platform))
}

function decodedCliInstallStatus(
  status: ProtocolCliInstallStatus,
  platform: CliInstallPlatform
): CliInstallStatus {
  const commandName = status.commandName.trim()
  if (!commandName) {
    throw invalidResponse('CLI command name is missing')
  }
  return {
    platform,
    commandName,
    commandPath: status.commandPath ?? null,
    pathDirectory: status.pathDirectory ?? null,
    pathConfigured: status.pathConfigured,
    launcherPath: status.launcherPath ?? null,
    installMethod: cliInstallMethod(status.installMethod),
    supported: status.supported,
    state: cliInstallState(status.state),
    currentTarget: status.currentTarget ?? null,
    unsupportedReason: cliInstallUnsupportedReason(status.unsupportedReason),
    detail: status.detail ?? null
  }
}

function hostPlatformName(platform: HostPlatform): CliInstallPlatform {
  switch (platform) {
    case HostPlatform.DARWIN:
      return 'darwin'
    case HostPlatform.LINUX:
      return 'linux'
    case HostPlatform.WINDOWS:
      return 'win32'
    case HostPlatform.UNSPECIFIED:
    case HostPlatform.UNKNOWN:
      return 'unknown'
  }
}

function cliInstallState(state: ProtocolCliInstallState): CliInstallState {
  switch (state) {
    case ProtocolCliInstallState.INSTALLED:
      return 'installed'
    case ProtocolCliInstallState.NOT_INSTALLED:
      return 'not_installed'
    case ProtocolCliInstallState.STALE:
      return 'stale'
    case ProtocolCliInstallState.CONFLICT:
      return 'conflict'
    case ProtocolCliInstallState.UNSUPPORTED:
      return 'unsupported'
    case ProtocolCliInstallState.UNSPECIFIED:
      throw invalidResponse('CLI install state is unspecified')
  }
  throw invalidResponse('CLI install state is unknown')
}

function cliInstallMethod(method: ProtocolCliInstallMethod | undefined): CliInstallMethod | null {
  if (method === undefined) {
    return null
  }
  switch (method) {
    case ProtocolCliInstallMethod.SYMLINK:
      return 'symlink'
    case ProtocolCliInstallMethod.WRAPPER:
      return 'wrapper'
    case ProtocolCliInstallMethod.UNSPECIFIED:
      throw invalidResponse('CLI install method is unspecified')
  }
  throw invalidResponse('CLI install method is unknown')
}

function cliInstallUnsupportedReason(
  reason: ProtocolCliInstallUnsupportedReason | undefined
): CliInstallUnsupportedReason | null {
  if (reason === undefined) {
    return null
  }
  switch (reason) {
    case ProtocolCliInstallUnsupportedReason.PLATFORM_NOT_SUPPORTED:
      return 'platform_not_supported'
    case ProtocolCliInstallUnsupportedReason.LAUNCHER_MISSING:
      return 'launcher_missing'
    case ProtocolCliInstallUnsupportedReason.LAUNCH_MODE_UNAVAILABLE:
      return 'launch_mode_unavailable'
    case ProtocolCliInstallUnsupportedReason.UNSPECIFIED:
      throw invalidResponse('CLI install unsupported reason is unspecified')
  }
  throw invalidResponse('CLI install unsupported reason is unknown')
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
