import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  ShellAgentStartProfilesAvatarKind,
  ShellAgentStartProfilesKind as ProtocolProfileKind,
  ShellAgentStartProfilesSwitchStatus as ProtocolSwitchStatus,
  ShellAgentStartProfilesTransferMode as ProtocolTransferMode,
  ShellAgentStartProfilesTransferStatus as ProtocolTransferStatus,
  type ShellAgentStartProfilesProfile as ProtocolProfile,
  type ShellAgentStartProfilesProjectPresence as ProtocolProjectPresence,
  type ShellAgentStartProfilesServiceCreateResponse,
  type ShellAgentStartProfilesServiceFindResponse,
  type ShellAgentStartProfilesServiceListResponse,
  type ShellAgentStartProfilesServiceSwitchResponse,
  type ShellAgentStartProfilesServiceTransferResponse
} from '../generated/agent_start/runtime/v1/shell_agentstart_profiles_pb.js'
import { RuntimeProtocolError } from './error.js'

export const SHELL_AGENT_START_PROFILES_PROTOCOL_CAPABILITY =
  'shell.agentstartProfiles.protobuf.v1' as const

// Why: field-for-field the workbench `AgentStartProfileSummary` projection so the
// profile switcher can adopt the protobuf client without a mapping layer.
export type AgentStartProfilesAvatarValue = { kind: 'initials'; initials: string; color: 'neutral' }

export type AgentStartProfilesProfileValue = {
  id: string
  name: string
  avatar: AgentStartProfilesAvatarValue
  kind: 'local'
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
}

export type AgentStartProfilesListValue = {
  activeProfileId: string
  profiles: AgentStartProfilesProfileValue[]
  multiProfileUi: boolean
}

export type AgentStartProfilesCreateLocalValue = {
  activeProfileId: string
  profiles: AgentStartProfilesProfileValue[]
  profile: AgentStartProfilesProfileValue
}

export type AgentStartProfilesSwitchValue = { status: 'already-active' | 'relaunching' }

export type AgentStartProfilesTransferValue =
  | {
      status: 'transferred'
      mode: AgentStartProfilesTransferModeValue
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

export type AgentStartProfilesTransferModeValue = 'move' | 'copy'

export type AgentStartProfilesProjectPresenceValue = {
  profileId: string
  profileName: string
  profileKind: 'local'
  repoId: string
  repoName: string
}

export function profilesList(
  value: ShellAgentStartProfilesServiceListResponse
): AgentStartProfilesListValue {
  return {
    activeProfileId: required(value.activeProfileId, 'Active profile ID'),
    profiles: value.profiles.map(profileValue),
    multiProfileUi: value.multiProfileUi
  }
}

export function profilesCreate(
  value: ShellAgentStartProfilesServiceCreateResponse
): AgentStartProfilesCreateLocalValue {
  return {
    activeProfileId: required(value.activeProfileId, 'Active profile ID'),
    profiles: value.profiles.map(profileValue),
    profile: profileValue(requiredMessage(value.profile, 'Created profile'))
  }
}

export function profilesSwitch(
  value: ShellAgentStartProfilesServiceSwitchResponse
): AgentStartProfilesSwitchValue {
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
  value: ShellAgentStartProfilesServiceTransferResponse
): AgentStartProfilesTransferValue {
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

export function profilesFind(value: ShellAgentStartProfilesServiceFindResponse): {
  projects: AgentStartProfilesProjectPresenceValue[]
} {
  return { projects: value.projects.map(projectPresence) }
}

export function protocolTransferMode(
  value: AgentStartProfilesTransferModeValue
): ProtocolTransferMode {
  switch (value) {
    case 'move':
      return ProtocolTransferMode.MOVE
    case 'copy':
      return ProtocolTransferMode.COPY
  }
}

function profileValue(value: ProtocolProfile): AgentStartProfilesProfileValue {
  const avatar = requiredMessage(value.avatar, 'Profile avatar')
  if (avatar.kind !== ShellAgentStartProfilesAvatarKind.INITIALS) {
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

function projectPresence(value: ProtocolProjectPresence): AgentStartProfilesProjectPresenceValue {
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

function transferMode(
  value: ProtocolTransferMode | undefined
): AgentStartProfilesTransferModeValue {
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
