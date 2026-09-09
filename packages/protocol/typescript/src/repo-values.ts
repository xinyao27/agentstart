import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  RepoIconImageSource,
  type Repo as ProtocolRepo,
  type RepoImageIcon,
  RepoKind,
  type RepoNullableGitRemoteIdentity,
  type RepoNullableIcon,
  type RepoNullableString,
  type RepoNullableUpstream
} from '../generated/yiru/runtime/v1/repo_pb.js'
import { RuntimeProtocolError } from './error.js'
import {
  externalWorktreeVisibility,
  forgeRemotePreference,
  forkSyncMode,
  projectHostSetupMethod,
  repoHookSettings
} from './repo-policy-values.js'
import { repoSourceControlAi } from './repo-source-ai-values.js'
import type { RepoIconValue, RepoValue } from './repo-types.js'

export const REPO_PROTOCOL_CAPABILITY = 'repo.catalog.protobuf.v1' as const

export function repoValue(repo: ProtocolRepo): RepoValue {
  const output: RepoValue = {
    id: required(repo.id, 'Repository ID'),
    path: required(repo.path, 'Repository path'),
    displayName: required(repo.displayName, 'Repository display name'),
    badgeColor: required(repo.badgeColor, 'Repository badge color'),
    addedAt: safeInteger(repo.addedAt, 'Repository added timestamp')
  }
  assign(output, 'repoIcon', repo.repoIcon && nullableIcon(repo.repoIcon))
  assign(output, 'upstream', repo.upstream && nullableUpstream(repo.upstream))
  assign(output, 'kind', kind(repo.kind))
  assign(output, 'gitUsername', repo.gitUsername)
  assign(output, 'worktreeBaseRef', repo.worktreeBaseRef)
  assign(output, 'worktreeBasePath', repo.worktreeBasePath)
  assign(output, 'hookSettings', repo.hookSettings && repoHookSettings(repo.hookSettings))
  assign(output, 'connectionId', repo.connectionId && nullableString(repo.connectionId))
  assign(
    output,
    'executionHostId',
    repo.executionHostId && executionHostId(nullableString(repo.executionHostId))
  )
  assign(output, 'forgeRemotePreference', forgeRemotePreference(repo.forgeRemotePreference))
  assign(output, 'forkSyncMode', forkSyncMode(repo.forkSyncMode))
  assign(
    output,
    'gitRemoteIdentity',
    repo.gitRemoteIdentity && nullableRemoteIdentity(repo.gitRemoteIdentity)
  )
  assign(
    output,
    'externalWorktreeVisibility',
    externalWorktreeVisibility(repo.externalWorktreeVisibility)
  )
  assign(output, 'externalWorktreeVisibilityLegacy', repo.externalWorktreeVisibilityLegacy)
  assign(
    output,
    'externalWorktreeVisibilityPromptDismissedAt',
    finite(repo.externalWorktreeVisibilityPromptDismissedAt, 'visibility prompt timestamp')
  )
  assign(
    output,
    'externalWorktreeInboxBaselinePaths',
    repo.externalWorktreeInboxBaselinePaths?.values
  )
  assign(output, 'importedExternalWorktreePaths', repo.importedExternalWorktreePaths?.values)
  assign(
    output,
    'externalWorktreeDiscoverySuppressedAt',
    finite(repo.externalWorktreeDiscoverySuppressedAt, 'visibility suppression timestamp')
  )
  assign(output, 'symlinkPaths', repo.symlinkPaths?.values)
  assign(output, 'projectGroupId', repo.projectGroupId && nullableString(repo.projectGroupId))
  assign(output, 'projectGroupOrder', finite(repo.projectGroupOrder, 'Repository group order'))
  assign(
    output,
    'sourceControlAi',
    repo.sourceControlAi && repoSourceControlAi(repo.sourceControlAi)
  )
  assign(output, 'projectHostSetupMethod', projectHostSetupMethod(repo.projectHostSetupMethod))
  return output
}

function assign<K extends keyof RepoValue>(
  output: RepoValue,
  key: K,
  value: RepoValue[K] | undefined
): void {
  if (value !== undefined) {
    output[key] = value
  }
}

function kind(value: RepoKind): RepoValue['kind'] {
  switch (value) {
    case RepoKind.GIT:
      return 'git'
    case RepoKind.FOLDER:
      return 'folder'
    case RepoKind.UNSPECIFIED:
      return undefined
  }
  throw invalidResponse('Repository kind is unknown')
}

function nullableIcon(value: RepoNullableIcon): RepoIconValue | null {
  switch (value.value.case) {
    case 'null':
      return null
    case 'icon': {
      const icon = value.value.value
      switch (icon.value.case) {
        case 'lucideName':
          return { type: 'lucide', name: required(icon.value.value, 'Icon name') }
        case 'emoji':
          return { type: 'emoji', emoji: required(icon.value.value, 'Icon emoji') }
        case 'image':
          return imageIcon(icon.value.value)
        case undefined:
          throw invalidResponse('Repository icon value is missing')
      }
    }
    case undefined:
      throw invalidResponse('Repository icon field is missing')
  }
}

function imageIcon(value: RepoImageIcon): RepoIconValue {
  return {
    type: 'image',
    src: required(value.src, 'Repository icon source'),
    source: imageSource(value.source),
    ...(value.label === undefined ? {} : { label: value.label })
  }
}

function imageSource(value: RepoIconImageSource): 'upload' | 'file' | 'favicon' | 'github' {
  switch (value) {
    case RepoIconImageSource.UPLOAD:
      return 'upload'
    case RepoIconImageSource.FILE:
      return 'file'
    case RepoIconImageSource.FAVICON:
      return 'favicon'
    case RepoIconImageSource.GITHUB:
      return 'github'
    case RepoIconImageSource.UNSPECIFIED:
      throw invalidResponse('Repository icon source is missing')
  }
  throw invalidResponse('Repository icon source is unknown')
}

function nullableUpstream(value: RepoNullableUpstream): RepoValue['upstream'] {
  switch (value.value.case) {
    case 'null':
      return null
    case 'upstream':
      return {
        owner: required(value.value.value.owner, 'Repository upstream owner'),
        repo: required(value.value.value.repo, 'Repository upstream name')
      }
    case undefined:
      throw invalidResponse('Repository upstream field is missing')
  }
}

function nullableRemoteIdentity(
  value: RepoNullableGitRemoteIdentity
): RepoValue['gitRemoteIdentity'] {
  switch (value.value.case) {
    case 'null':
      return null
    case 'identity':
      return {
        canonicalKey: required(value.value.value.canonicalKey, 'Remote canonical key'),
        remoteName: required(value.value.value.remoteName, 'Remote name'),
        remoteUrl: required(value.value.value.remoteUrl, 'Remote URL')
      }
    case undefined:
      throw invalidResponse('Repository remote identity field is missing')
  }
}

function nullableString(value: RepoNullableString): string | null {
  switch (value.value.case) {
    case 'text':
      return value.value.value
    case 'null':
      return null
    case undefined:
      throw invalidResponse('Repository nullable string is missing')
  }
}

function executionHostId(value: string | null): RepoValue['executionHostId'] {
  if (value === null || isExecutionHostId(value)) {
    return value
  }
  throw invalidResponse('Repository execution host identifier is invalid')
}

function isExecutionHostId(value: string): value is NonNullable<RepoValue['executionHostId']> {
  if (value === 'local') {
    return true
  }
  const match = /^(?:runtime|ssh|wsl):(.+)$/.exec(value)
  if (!match) {
    return false
  }
  try {
    return decodeURIComponent(match[1]).length > 0
  } catch {
    return false
  }
}

function required(value: string, label: string): string {
  if (value.length === 0) {
    throw invalidResponse(`${label} is missing`)
  }
  return value
}

function safeInteger(value: bigint, label: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) {
    throw invalidResponse(`${label} is outside the safe integer range`)
  }
  return number
}

function finite(value: number | undefined, label: string): number | undefined {
  if (value !== undefined && !Number.isFinite(value)) {
    throw invalidResponse(`${label} is not finite`)
  }
  return value
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
