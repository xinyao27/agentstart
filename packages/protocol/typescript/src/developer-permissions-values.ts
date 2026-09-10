import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  DeveloperPermissionId as ProtocolPermissionId,
  DeveloperPermissionStatus as ProtocolPermissionStatus,
  type DeveloperPermissionState as ProtocolPermissionState
} from '../generated/agent_start/runtime/v1/developer_permissions_pb.js'
import { RuntimeProtocolError } from './error.js'

export const DEVELOPER_PERMISSIONS_PROTOCOL_CAPABILITY = 'developerPermissions.protobuf.v1' as const

export type DeveloperPermissionId =
  | 'microphone'
  | 'camera'
  | 'screen'
  | 'accessibility'
  | 'full-disk-access'
  | 'automation'
  | 'local-network'
  | 'usb'
  | 'bluetooth'

export type DeveloperPermissionStatus =
  | 'granted'
  | 'denied'
  | 'not-determined'
  | 'restricted'
  | 'unknown'
  | 'unsupported'
  | 'ready'

export type DeveloperPermissionState = Readonly<{
  id: DeveloperPermissionId
  status: DeveloperPermissionStatus
}>

export type DeveloperPermissionRequestResult = Readonly<{
  id: DeveloperPermissionId
  openedSystemSettings: boolean
  status: DeveloperPermissionStatus
}>

const PERMISSION_IDS: Readonly<Record<DeveloperPermissionId, ProtocolPermissionId>> = {
  microphone: ProtocolPermissionId.MICROPHONE,
  camera: ProtocolPermissionId.CAMERA,
  screen: ProtocolPermissionId.SCREEN,
  accessibility: ProtocolPermissionId.ACCESSIBILITY,
  'full-disk-access': ProtocolPermissionId.FULL_DISK_ACCESS,
  automation: ProtocolPermissionId.AUTOMATION,
  'local-network': ProtocolPermissionId.LOCAL_NETWORK,
  usb: ProtocolPermissionId.USB,
  bluetooth: ProtocolPermissionId.BLUETOOTH
}

export function protocolPermissionId(id: DeveloperPermissionId): ProtocolPermissionId {
  return PERMISSION_IDS[id]
}

export function developerPermissionState(
  state: ProtocolPermissionState | undefined
): DeveloperPermissionState {
  if (!state) {
    throw invalidPermissionResponse('Developer permission response is missing the permission')
  }
  return { id: permissionId(state.id), status: permissionStatus(state.status) }
}

function permissionId(id: ProtocolPermissionId): DeveloperPermissionId {
  switch (id) {
    case ProtocolPermissionId.MICROPHONE:
      return 'microphone'
    case ProtocolPermissionId.CAMERA:
      return 'camera'
    case ProtocolPermissionId.SCREEN:
      return 'screen'
    case ProtocolPermissionId.ACCESSIBILITY:
      return 'accessibility'
    case ProtocolPermissionId.FULL_DISK_ACCESS:
      return 'full-disk-access'
    case ProtocolPermissionId.AUTOMATION:
      return 'automation'
    case ProtocolPermissionId.LOCAL_NETWORK:
      return 'local-network'
    case ProtocolPermissionId.USB:
      return 'usb'
    case ProtocolPermissionId.BLUETOOTH:
      return 'bluetooth'
    case ProtocolPermissionId.UNSPECIFIED:
      throw invalidPermissionResponse('Developer permission response has no permission id')
  }
}

function permissionStatus(status: ProtocolPermissionStatus): DeveloperPermissionStatus {
  switch (status) {
    case ProtocolPermissionStatus.GRANTED:
      return 'granted'
    case ProtocolPermissionStatus.DENIED:
      return 'denied'
    case ProtocolPermissionStatus.NOT_DETERMINED:
      return 'not-determined'
    case ProtocolPermissionStatus.RESTRICTED:
      return 'restricted'
    case ProtocolPermissionStatus.UNSUPPORTED:
      return 'unsupported'
    case ProtocolPermissionStatus.READY:
      return 'ready'
    // Why: an unset status is as informative as an explicit unknown, and the
    // pane renders both the same way.
    case ProtocolPermissionStatus.UNKNOWN:
    case ProtocolPermissionStatus.UNSPECIFIED:
      return 'unknown'
  }
}

function invalidPermissionResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
