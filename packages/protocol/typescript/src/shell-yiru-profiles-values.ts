import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  ShellYiruProfilesAvatarKind,
  ShellYiruProfilesKind as ProtocolProfileKind,
  ShellYiruProfilesSwitchStatus as ProtocolSwitchStatus,
  ShellYiruProfilesTransferMode as ProtocolTransferMode,
  ShellYiruProfilesTransferStatus as ProtocolTransferStatus,
  type ShellYiruProfilesProfile as ProtocolProfile,
  type ShellYiruProfilesProjectPresence as ProtocolProjectPresence,
  type ShellYiruProfilesServiceCreateResponse,
  type ShellYiruProfilesServiceFindResponse,
  type ShellYiruProfilesServiceListResponse,
  type ShellYiruProfilesServiceSwitchResponse,
  type ShellYiruProfilesServiceTransferResponse
} from '../generated/yiru/runtime/v1/shell_yiru_profiles_pb.js'
import { RuntimeProtocolError } from './error.js'

export const SHELL_YIRU_PROFILES_PROTOCOL_CAPABILITY = 'shell.yiruProfiles.protobuf.v1' as const

// Why: field-for-field the workbench `YiruProfileSummary` projection so the
// profile switcher can adopt the protobuf client without a mapping layer.
export type YiruProfilesAvatarValue = { kind: 'initials'; initials: string; color: 'neutral' }

export type YiruProfilesProfileValue = {
  id: string
  name: string
  avatar: YiruProfilesAvatarValue
  kind: 'local'
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
}

export type YiruProfilesListValue = {
  activeProfileId: string
  profiles: YiruProfilesProfileValue[]
  multiProfileUi: boolean
}

export type YiruProfilesCreateLocalValue = {
  activeProfileId: string
  profiles: YiruProfilesProfileValue[]
  profile: YiruProfilesProfileValue
}

export type YiruProfilesSwitchValue = { status: 'already-active' | 'relaunching' }

export type YiruProfilesTransferValue =
  | {
      status: 'transferred'
      mode: YiruProfilesTransferModeValue
      sourceProfileId: string
      targetProfileId: string
      sourceRepoId: string
      targetRepoId: string
      targetProjectId: string | null
      willRelaunch?: boolean
    }
  | {
      status: 'duplicate-target'
      sourceProfileId: string
      targetProfileId: string
      sourceRepoId: string
      duplicateRepoId: string
    }

export type YiruProfilesTransferModeValue = 'move' | 'copy'

export type YiruProfilesProjectPresenceValue = {
  profileId: string
  profileName: string
  profileKind: 'local'
  repoId: string
  repoName: string
}

export function profilesList(value: ShellYiruProfilesServiceListResponse): YiruProfilesListValue {
  return {
    activeProfileId: required(value.activeProfileId, 'Active profile ID'),
    profiles: value.profiles.map(profileValue),
    multiProfileUi: value.multiProfileUi
  }
}

export function profilesCreate(
  value: ShellYiruProfilesServiceCreateResponse
): YiruProfilesCreateLocalValue {
  return {
    activeProfileId: required(value.activeProfileId, 'Active profile ID'),
    profiles: value.profiles.map(profileValue),
    profile: profileValue(requiredMessage(value.profile, 'Created profile'))
  }
}

export function profilesSwitch(
  value: ShellYiruProfilesServiceSwitchResponse
): YiruProfilesSwitchValue {
  switch (value.status) {
    case ProtocolSwitchStatus.ALREADY_ACTIVE:
      return { status: 'already-active' }
    case ProtocolSwitchStatus.RELAUNCHING:
      return { status: 'relaunching' }
    case ProtocolSwitchStatus.UNSPECIFIED:
      break
  }
  throw invalidResponse('Profile switch answered an unknown status')
}

export function profilesTransfer(
  value: ShellYiruProfilesServiceTransferResponse
): YiruProfilesTransferValue {
  switch (value.status) {
    case ProtocolTransferStatus.TRANSFERRED:
      return {
        status: 'transferred',
        mode: transferMode(value.mode),
        sourceProfileId: value.sourceProfileId,
        targetProfileId: value.targetProfileId,
        sourceRepoId: value.sourceRepoId,
        targetRepoId: required(
          value.targetRepoId ?? '',
          'Transferred project target repository ID'
        ),
        targetProjectId: value.targetProjectId ?? null,
        ...(value.willRelaunch === undefined ? {} : { willRelaunch: value.willRelaunch })
      }
    case ProtocolTransferStatus.DUPLICATE_TARGET:
      return {
        status: 'duplicate-target',
        sourceProfileId: value.sourceProfileId,
        targetProfileId: value.targetProfileId,
        sourceRepoId: value.sourceRepoId,
        duplicateRepoId: required(value.duplicateRepoId ?? '', 'Duplicate target repository ID')
      }
    case ProtocolTransferStatus.UNSPECIFIED:
      break
  }
  throw invalidResponse('Profile transfer answered an unknown status')
}

export function profilesFind(value: ShellYiruProfilesServiceFindResponse): {
  projects: YiruProfilesProjectPresenceValue[]
} {
  return { projects: value.projects.map(projectPresence) }
}

export function protocolTransferMode(value: YiruProfilesTransferModeValue): ProtocolTransferMode {
  switch (value) {
    case 'move':
      return ProtocolTransferMode.MOVE
    case 'copy':
      return ProtocolTransferMode.COPY
  }
}

function profileValue(value: ProtocolProfile): YiruProfilesProfileValue {
  const avatar = requiredMessage(value.avatar, 'Profile avatar')
  if (avatar.kind !== ShellYiruProfilesAvatarKind.INITIALS) {
    throw invalidResponse('Profile avatar kind is invalid')
  }
  return {
    id: required(value.id, 'Profile ID'),
    name: value.name,
    avatar: {
      kind: 'initials',
      initials: avatar.initials,
      // Why: the workbench avatar palette has exactly one color and the daemon
      // renders it, so anything else means the wire shape drifted.
      color: avatarColor(avatar.color)
    },
    kind: profileKind(value.kind),
    createdAt: epochMs(value.createdAt),
    updatedAt: epochMs(value.updatedAt),
    lastOpenedAt: epochMs(value.lastOpenedAt)
  }
}

function projectPresence(value: ProtocolProjectPresence): YiruProfilesProjectPresenceValue {
  return {
    profileId: value.profileId,
    profileName: value.profileName,
    profileKind: profileKind(value.profileKind),
    repoId: value.repoId,
    repoName: value.repoName
  }
}

function profileKind(value: ProtocolProfileKind): 'local' {
  if (value !== ProtocolProfileKind.LOCAL) {
    throw invalidResponse('Profile kind is invalid')
  }
  return 'local'
}

function transferMode(value: ProtocolTransferMode | undefined): YiruProfilesTransferModeValue {
  switch (value) {
    case ProtocolTransferMode.MOVE:
      return 'move'
    case ProtocolTransferMode.COPY:
      return 'copy'
    case ProtocolTransferMode.UNSPECIFIED:
    case undefined:
      break
  }
  throw invalidResponse('Transferred project mode is missing')
}

function avatarColor(value: string): 'neutral' {
  if (value !== 'neutral') {
    throw invalidResponse('Profile avatar color is invalid')
  }
  return 'neutral'
}

function epochMs(value: bigint): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) {
    throw invalidResponse('Timestamp is outside the safe integer range')
  }
  return number
}

function required(value: string, label: string): string {
  if (value.length === 0) {
    throw invalidResponse(`${label} is missing`)
  }
  return value
}

function requiredMessage<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw invalidResponse(`${label} is missing`)
  }
  return value
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
