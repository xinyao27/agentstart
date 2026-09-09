import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  PreflightPathSource as ProtocolPathSource,
  PreflightShellHydrationFailureReason as ProtocolShellHydrationFailureReason,
  type PreflightServiceCheckResponse,
  type PreflightServiceRefreshAgentsResponse
} from '../generated/yiru/runtime/v1/preflight_pb.js'
import { RuntimeProtocolError } from './error.js'

export const PREFLIGHT_PROTOCOL_CAPABILITY = 'preflight.protobuf.v1' as const

export type PreflightStatusValue = {
  git: { installed: boolean }
  gh: { installed: boolean; authenticated: boolean }
}

// Why: the probe target selection consumes only the runtime kind, the WSL
// distro, and the repair reason; the renderer's project-runtime resolution
// carries renderer bookkeeping the authority never reads, so the wire context
// keeps only what changes behavior.
export type PreflightResolvedRuntimeValue =
  | { kind: 'local-host' }
  | { kind: 'windows-host' }
  | { kind: 'wsl'; distro: string }

export type PreflightRepairRequiredValue = {
  reason: 'wsl-unavailable' | 'wsl-distro-required' | 'wsl-distro-missing'
}

export type PreflightProjectRuntimeValue =
  | { status: 'resolved'; runtime: PreflightResolvedRuntimeValue }
  | { status: 'repair-required'; repair: PreflightRepairRequiredValue }

export type PreflightContextValue = {
  wslDistro?: string | null
  wslDefault?: boolean
  projectRuntime?: PreflightProjectRuntimeValue
}

export type PreflightCheckInput = {
  force?: boolean
  wslDistro?: string | null
  wslDefault?: boolean
  projectRuntime?: PreflightProjectRuntimeValue
}

export type PreflightAgentContextInput = {
  wslDistro?: string | null
  wslDefault?: boolean
  projectRuntime?: PreflightProjectRuntimeValue
}

export type PreflightDetectRemoteAgentsInput = { connectionId: string }

export type PreflightPathSourceValue = 'shell_hydrate' | 'sync_seed_only'

export type PreflightShellHydrationFailureReasonValue =
  | 'none'
  | 'no_shell'
  | 'timeout'
  | 'spawn_error'
  | 'empty_path'

export type PreflightRefreshAgentsValue = {
  agents: string[]
  addedPathSegments: string[]
  shellHydrationOk: boolean
  pathSource: PreflightPathSourceValue
  pathFailureReason: PreflightShellHydrationFailureReasonValue
}

export function decodePreflightStatus(
  response: PreflightServiceCheckResponse
): PreflightStatusValue {
  return {
    git: { installed: response.git?.installed ?? false },
    gh: {
      installed: response.gh?.installed ?? false,
      authenticated: response.gh?.authenticated ?? false
    }
  }
}

export function decodePreflightRefresh(
  response: PreflightServiceRefreshAgentsResponse
): PreflightRefreshAgentsValue {
  return {
    agents: [...response.agents],
    addedPathSegments: [...response.addedPathSegments],
    shellHydrationOk: response.shellHydrationOk,
    pathSource: pathSource(response.pathSource),
    pathFailureReason: shellHydrationFailureReason(response.pathFailureReason)
  }
}

function pathSource(value: number): PreflightPathSourceValue {
  switch (value) {
    case ProtocolPathSource.SHELL_HYDRATE:
      return 'shell_hydrate'
    case ProtocolPathSource.SYNC_SEED_ONLY:
      return 'sync_seed_only'
    case ProtocolPathSource.UNSPECIFIED:
      throw invalidResponse('Preflight path source is unspecified')
  }
  throw invalidResponse('Preflight path source is unknown')
}

function shellHydrationFailureReason(value: number): PreflightShellHydrationFailureReasonValue {
  switch (value) {
    case ProtocolShellHydrationFailureReason.NONE:
      return 'none'
    case ProtocolShellHydrationFailureReason.NO_SHELL:
      return 'no_shell'
    case ProtocolShellHydrationFailureReason.TIMEOUT:
      return 'timeout'
    case ProtocolShellHydrationFailureReason.SPAWN_ERROR:
      return 'spawn_error'
    case ProtocolShellHydrationFailureReason.EMPTY_PATH:
      return 'empty_path'
    case ProtocolShellHydrationFailureReason.UNSPECIFIED:
      throw invalidResponse('Preflight shell hydration failure reason is unspecified')
  }
  throw invalidResponse('Preflight shell hydration failure reason is unknown')
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
