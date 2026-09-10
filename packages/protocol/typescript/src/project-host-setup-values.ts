import type {
  ProjectHostSetupProject,
  ProjectHostSetupRecord,
  ProjectHostSetupRepo,
  ProjectHostSetupServiceListResponse,
  ProjectHostSetupServiceMutationResponse
} from '../generated/agent_start/runtime/v1/project_host_setup_pb.js'
import {
  externalWorktreeVisibility,
  hostId,
  invalidResponse,
  kind,
  method,
  repoKind,
  repoSetupMethod,
  revision,
  state,
  timestamp
} from './project-host-setup-enum-values.js'
import { projectHostSetupRepoIcon } from './project-host-setup-json-values.js'
import type { RepoKindValue, RepoIconValue } from './repo-types.js'

export const PROJECT_HOST_SETUP_PROTOCOL_CAPABILITY = 'projectHostSetup.protobuf.v1' as const

export type ProjectHostSetupHostId =
  | 'local'
  | `runtime:${string}`
  | `ssh:${string}`
  | `wsl:${string}`
export type ProjectHostSetupStateValue =
  | 'ready'
  | 'not-set-up'
  | 'setting-up'
  | 'error'
  | 'unsupported'
export type ProjectHostSetupMethodValue =
  | 'legacy-repo'
  | 'imported-existing-folder'
  | 'cloned'
  | 'provisioned'
// Why: this projection contains only the fields owned by the setup authority.
export type ProjectHostSetupRecordValue = {
  id: string
  projectId: string
  hostId: ProjectHostSetupHostId
  repoId: string
  path: string
  displayName: string
  kind?: RepoKindValue
  executionHostId?: ProjectHostSetupHostId | null
  worktreeBasePath?: string
  gitUsername?: string
  setupState: ProjectHostSetupStateValue
  setupMethod: ProjectHostSetupMethodValue
  createdAt: number
  updatedAt: number
}
export type ProjectHostSetupProjectValue = {
  id: string
  displayName: string
  badgeColor: string
  repoIcon?: RepoIconValue | null
  kind?: RepoKindValue
  providerIdentity?: { provider: 'github'; owner: string; repo: string }
  gitRemoteIdentity?: { canonicalKey: string; remoteName: string; remoteUrl: string }
  localWindowsRuntimePreference?:
    | { kind: 'inherit-global' }
    | { kind: 'windows-host' }
    | { kind: 'wsl'; distro: string }
  sourceRepoIds: string[]
  createdAt: number
  updatedAt: number
}
export type ProjectHostSetupRepoValue = {
  id: string
  path: string
  displayName: string
  badgeColor: string
  upstream?: { owner: string; repo: string } | null
  addedAt: number
  kind: RepoKindValue
  executionHostId?: ProjectHostSetupHostId
  gitRemoteIdentity?: { canonicalKey: string; remoteName: string; remoteUrl: string }
  externalWorktreeVisibility?: 'hide' | 'show'
  worktreeBasePath?: string
  projectHostSetupMethod?: 'imported-existing-folder' | 'cloned'
}
export type ProjectHostSetupListResultValue = {
  setups: ProjectHostSetupRecordValue[]
  revision: number
}
export type ProjectHostSetupMutationValue = {
  result: {
    project: ProjectHostSetupProjectValue
    repo?: ProjectHostSetupRepoValue
    setup: ProjectHostSetupRecordValue
  }
  revision: number
}

export function projectHostSetupList(
  value: ProjectHostSetupServiceListResponse
): ProjectHostSetupListResultValue {
  return { setups: value.setups.map(projectHostSetupRecord), revision: revision(value.revision) }
}

export function projectHostSetupMutation(
  value: ProjectHostSetupServiceMutationResponse
): ProjectHostSetupMutationValue {
  const result = value.result
  if (!result?.project || !result.setup) {
    throw invalidResponse('Project host setup mutation result is missing')
  }
  return {
    result: {
      project: project(result.project),
      ...(result.repo ? { repo: repo(result.repo) } : {}),
      setup: projectHostSetupRecord(result.setup)
    },
    revision: revision(value.revision)
  }
}

function projectHostSetupRecord(value: ProjectHostSetupRecord): ProjectHostSetupRecordValue {
  const recordKind = kind(value.kind)
  return {
    id: value.id,
    projectId: value.projectId,
    hostId: hostId(value.hostId, 'Project host setup host identifier is invalid'),
    repoId: value.repoId,
    path: value.path,
    displayName: value.displayName,
    ...(recordKind ? { kind: recordKind } : {}),
    ...(value.executionHostId === undefined
      ? {}
      : { executionHostId: hostId(value.executionHostId, 'Execution host identifier is invalid') }),
    ...(value.worktreeBasePath === undefined ? {} : { worktreeBasePath: value.worktreeBasePath }),
    ...(value.gitUsername === undefined ? {} : { gitUsername: value.gitUsername }),
    setupState: state(value.setupState),
    setupMethod: method(value.setupMethod),
    createdAt: timestamp(value.createdAt),
    updatedAt: timestamp(value.updatedAt)
  }
}

function project(value: ProjectHostSetupProject): ProjectHostSetupProjectValue {
  const identity = value.gitRemoteIdentity
  const provider = value.providerIdentity
  const projectKind = kind(value.kind)
  const icon = value.repoIcon ? projectHostSetupRepoIcon(value.repoIcon) : undefined
  return {
    id: value.id,
    displayName: value.displayName,
    badgeColor: value.badgeColor,
    ...(icon ? { repoIcon: icon } : {}),
    ...(projectKind ? { kind: projectKind } : {}),
    ...(provider
      ? {
          providerIdentity: {
            provider: 'github' as const,
            owner: provider.owner,
            repo: provider.repo
          }
        }
      : {}),
    ...(identity
      ? {
          gitRemoteIdentity: {
            canonicalKey: identity.canonicalKey,
            remoteName: identity.remoteName,
            remoteUrl: identity.remoteUrl
          }
        }
      : {}),
    ...windowsPreference(value.localWindowsRuntimePreference),
    sourceRepoIds: [...value.sourceRepoIds],
    createdAt: timestamp(value.createdAt),
    updatedAt: timestamp(value.updatedAt)
  }
}

function repo(value: ProjectHostSetupRepo): ProjectHostSetupRepoValue {
  const identity = value.gitRemoteIdentity
  const repoMethod = repoSetupMethod(value.projectHostSetupMethod)
  return {
    id: value.id,
    path: value.path,
    displayName: value.displayName,
    badgeColor: value.badgeColor,
    ...(value.upstream
      ? { upstream: { owner: value.upstream.owner, repo: value.upstream.repo } }
      : {}),
    addedAt: timestamp(value.addedAt),
    kind: repoKind(value.kind),
    executionHostId: hostId(value.executionHostId, 'Execution host identifier is invalid'),
    ...(identity
      ? {
          gitRemoteIdentity: {
            canonicalKey: identity.canonicalKey,
            remoteName: identity.remoteName,
            remoteUrl: identity.remoteUrl
          }
        }
      : {}),
    ...externalWorktreeVisibility(value.externalWorktreeVisibility),
    ...(value.worktreeBasePath === undefined ? {} : { worktreeBasePath: value.worktreeBasePath }),
    ...(repoMethod ? { projectHostSetupMethod: repoMethod } : {})
  }
}

function windowsPreference(value: ProjectHostSetupProject['localWindowsRuntimePreference']):
  | {}
  | {
      localWindowsRuntimePreference: ProjectHostSetupProjectValue['localWindowsRuntimePreference']
    } {
  const preference = value?.preference
  switch (preference?.case) {
    case undefined:
      return {}
    case 'inheritGlobal':
      return { localWindowsRuntimePreference: { kind: 'inherit-global' } }
    case 'windowsHost':
      return { localWindowsRuntimePreference: { kind: 'windows-host' } }
    case 'wslDistro':
      return { localWindowsRuntimePreference: { kind: 'wsl', distro: preference.value } }
  }
}
