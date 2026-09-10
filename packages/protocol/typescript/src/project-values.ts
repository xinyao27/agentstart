import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  ProjectKind,
  type Project,
  type ProjectJsonValue
} from '../generated/agent_start/runtime/v1/project_pb.js'
import { RuntimeProtocolError } from './error.js'
import type { RepoIconValue } from './repo-types.js'
import { safeNumber } from './shell-state-values.js'

export const PROJECT_PROTOCOL_CAPABILITY = 'project.protobuf.v1' as const

export type ProjectGitRemoteIdentityValue = {
  canonicalKey: string
  remoteName: string
  remoteUrl: string
}

export type ProjectProviderIdentityValue = {
  provider: 'github'
  owner: string
  repo: string
}

export type ProjectRuntimePreferenceValue =
  | { kind: 'inherit-global' }
  | { kind: 'windows-host' }
  | { kind: 'wsl'; distro: string }

// Why: decoders materialize every field; persisted catalog projections may omit optional fields.
export type ProjectValue = {
  id: string
  displayName: string
  badgeColor: string
  repoIcon: RepoIconValue | null
  kind: 'git' | 'folder'
  providerIdentity: ProjectProviderIdentityValue | undefined
  gitRemoteIdentity: ProjectGitRemoteIdentityValue | undefined
  localWindowsRuntimePreference: ProjectRuntimePreferenceValue | undefined
  sourceRepoIds: string[]
  createdAt: number
  updatedAt: number
}

export function projectValue(project: Project): ProjectValue {
  return {
    id: project.id,
    displayName: project.displayName,
    badgeColor: project.badgeColor,
    repoIcon: projectRepoIcon(project.repoIcon),
    kind: projectKind(project.kind),
    providerIdentity: project.providerIdentity
      ? {
          provider: providerName(project.providerIdentity.provider),
          owner: project.providerIdentity.owner,
          repo: project.providerIdentity.repo
        }
      : undefined,
    gitRemoteIdentity: project.gitRemoteIdentity
      ? {
          canonicalKey: project.gitRemoteIdentity.canonicalKey,
          remoteName: project.gitRemoteIdentity.remoteName,
          remoteUrl: project.gitRemoteIdentity.remoteUrl
        }
      : undefined,
    localWindowsRuntimePreference: runtimePreference(project.localWindowsRuntimePreference),
    sourceRepoIds: [...project.sourceRepoIds],
    createdAt: safeNumber(project.createdAt, 'Project created timestamp'),
    updatedAt: safeNumber(project.updatedAt, 'Project updated timestamp')
  }
}

function projectKind(kind: ProjectKind): ProjectValue['kind'] {
  switch (kind) {
    case ProjectKind.FOLDER:
      return 'folder'
    case ProjectKind.GIT:
      return 'git'
    case ProjectKind.UNSPECIFIED:
      break
  }
  throw invalidResponse('Project kind is missing')
}

function providerName(provider: string): 'github' {
  if (provider !== 'github') {
    throw invalidResponse(`Project provider is unsupported: ${provider}`)
  }
  return 'github'
}

function runtimePreference(
  value: Project['localWindowsRuntimePreference']
): ProjectRuntimePreferenceValue | undefined {
  switch (value?.kind.case) {
    case 'inheritGlobal':
      return { kind: 'inherit-global' }
    case 'windowsHost':
      return { kind: 'windows-host' }
    case 'wslDistro':
      return { kind: 'wsl', distro: value.kind.value }
    case undefined:
      return undefined
  }
}

// Why: the icon field is open-ended JSON in the catalog row (lucide name,
// emoji, or image payload), so the decoder rebuilds the discriminated icon
// union instead of handing callers untyped JSON.
function projectRepoIcon(value: ProjectJsonValue | undefined): RepoIconValue | null {
  if (value === undefined) {
    return null
  }
  const plain = projectJson(value)
  if (!isRecord(plain)) {
    throw invalidResponse('Project repo icon is malformed')
  }
  if (plain.type === 'lucide' && typeof plain.name === 'string') {
    return { type: 'lucide', name: plain.name }
  }
  if (plain.type === 'emoji' && typeof plain.emoji === 'string') {
    return { type: 'emoji', emoji: plain.emoji }
  }
  if (plain.type === 'image' && typeof plain.src === 'string' && isImageSource(plain.source)) {
    return typeof plain.label === 'string'
      ? { type: 'image', src: plain.src, source: plain.source, label: plain.label }
      : { type: 'image', src: plain.src, source: plain.source }
  }
  throw invalidResponse('Project repo icon is malformed')
}

function projectJson(value: ProjectJsonValue): unknown {
  switch (value.kind.case) {
    case undefined:
    case 'nullValue':
      return null
    case 'boolValue':
      return value.kind.value
    case 'numberValue':
      return value.kind.value
    case 'stringValue':
      return value.kind.value
    case 'listValue':
      return value.kind.value.values.map(projectJson)
    case 'objectValue':
      return Object.fromEntries(
        value.kind.value.entries.map((entry) => [
          entry.key,
          entry.value === undefined ? null : projectJson(entry.value)
        ])
      )
  }
}

function isImageSource(value: unknown): value is 'upload' | 'file' | 'favicon' | 'github' {
  return value === 'upload' || value === 'file' || value === 'favicon' || value === 'github'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
