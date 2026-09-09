import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  ComputerPermissionId as ProtocolPermissionId,
  ComputerPermissionStatus as ProtocolPermissionStatus,
  type ComputerPermissionState as ProtocolPermissionState,
  type ComputerServicePermissionsResetResponse,
  type ComputerServicePermissionsResponse,
  type ComputerServicePermissionsStatusResponse
} from '../generated/yiru/runtime/v1/computer_pb.js'
import { HostPlatform } from '../generated/yiru/runtime/v1/host_registry_pb.js'
import { RuntimeProtocolError } from './error.js'

export const COMPUTER_PROTOCOL_CAPABILITY = 'computer.protobuf.v1' as const

export type ComputerHostPlatform = 'darwin' | 'linux' | 'win32' | 'unknown'

export type ComputerPermissionId = 'accessibility' | 'screenshots'

export type ComputerPermissionStatus = 'granted' | 'not-granted' | 'unsupported'

export type ComputerPermissionState = Readonly<{
  id: ComputerPermissionId
  status: ComputerPermissionStatus
}>

export type ComputerPermissionStatusResult = Readonly<{
  platform: ComputerHostPlatform
  helperAppPath: string | null
  helperUnavailableReason: string | null
  permissions: ComputerPermissionState[]
}>

export type ComputerPermissionSetupResult = Readonly<{
  platform: ComputerHostPlatform
  helperAppPath: string | null
  permissionId: ComputerPermissionId | null
  openedSettings: boolean
  launchedHelper: boolean
  permissions: ComputerPermissionState[]
  nextStep: string | null
}>

export type ComputerPermissionResetResult = Readonly<{
  platform: ComputerHostPlatform
  helperAppPath: string | null
  helperUnavailableReason: string | null
  permissions: ComputerPermissionState[]
  bundleId: string | null
}>

const PERMISSION_IDS: Readonly<Record<ComputerPermissionId, ProtocolPermissionId>> = {
  accessibility: ProtocolPermissionId.ACCESSIBILITY,
  screenshots: ProtocolPermissionId.SCREENSHOTS
}

export function protocolComputerPermissionId(id: ComputerPermissionId): ProtocolPermissionId {
  return PERMISSION_IDS[id]
}

export function computerPermissionStatusResult(
  response: ComputerServicePermissionsStatusResponse
): ComputerPermissionStatusResult {
  return {
    platform: hostPlatform(response.platform),
    helperAppPath: response.helperAppPath ?? null,
    helperUnavailableReason: response.helperUnavailableReason ?? null,
    permissions: response.permissions.map(permissionState)
  }
}

export function computerPermissionSetupResult(
  response: ComputerServicePermissionsResponse
): ComputerPermissionSetupResult {
  return {
    platform: hostPlatform(response.platform),
    helperAppPath: response.helperAppPath ?? null,
    permissionId: response.permissionId === undefined ? null : permissionId(response.permissionId),
    openedSettings: response.openedSettings,
    launchedHelper: response.launchedHelper,
    permissions: response.permissions.map(permissionState),
    nextStep: response.nextStep ?? null
  }
}

export function computerPermissionResetResult(
  response: ComputerServicePermissionsResetResponse
): ComputerPermissionResetResult {
  return {
    platform: hostPlatform(response.platform),
    helperAppPath: response.helperAppPath ?? null,
    helperUnavailableReason: response.helperUnavailableReason ?? null,
    permissions: response.permissions.map(permissionState),
    bundleId: response.bundleId ?? null
  }
}

function permissionState(state: ProtocolPermissionState): ComputerPermissionState {
  return { id: permissionId(state.id), status: permissionStatus(state.status) }
}

function permissionId(id: ProtocolPermissionId): ComputerPermissionId {
  switch (id) {
    case ProtocolPermissionId.ACCESSIBILITY:
      return 'accessibility'
    case ProtocolPermissionId.SCREENSHOTS:
      return 'screenshots'
    case ProtocolPermissionId.UNSPECIFIED:
      throw invalidResponse('Computer-use permission id is unspecified')
  }
}

function permissionStatus(status: ProtocolPermissionStatus): ComputerPermissionStatus {
  switch (status) {
    case ProtocolPermissionStatus.GRANTED:
      return 'granted'
    case ProtocolPermissionStatus.NOT_GRANTED:
      return 'not-granted'
    case ProtocolPermissionStatus.UNSUPPORTED:
      return 'unsupported'
    case ProtocolPermissionStatus.UNSPECIFIED:
      throw invalidResponse('Computer-use permission status is unspecified')
  }
}

function hostPlatform(platform: HostPlatform): ComputerHostPlatform {
  switch (platform) {
    case HostPlatform.DARWIN:
      return 'darwin'
    case HostPlatform.LINUX:
      return 'linux'
    case HostPlatform.WINDOWS:
      return 'win32'
    case HostPlatform.UNKNOWN:
      return 'unknown'
    case HostPlatform.UNSPECIFIED:
      throw invalidResponse('Computer-use host platform is unspecified')
  }
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
