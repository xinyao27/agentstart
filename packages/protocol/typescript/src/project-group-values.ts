import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  ProjectGroupCreatedFrom,
  ProjectGroupImportMode,
  ProjectGroupImportStatus,
  type ProjectGroupServiceImportNestedResponse,
  type ProjectGroupServiceImportProjectResult,
  type ProjectGroupServiceMoveProjectResponse,
  type ProjectGroup as ProjectGroupMessage,
  type ProjectGroupRepo as ProjectGroupRepoMessage
} from '../generated/yiru/runtime/v1/project_group_pb.js'
import { RepoExternalWorktreeVisibility, RepoKind } from '../generated/yiru/runtime/v1/repo_pb.js'
import { RuntimeProtocolError } from './error.js'
import type { NestedRepoScanResultValue } from './project-group-scan-values.js'

export const PROJECT_GROUP_PROTOCOL_CAPABILITY = 'projectGroup.protobuf.v1' as const

export type ProjectGroupCreatedFromValue = 'manual' | 'folder-scan' | 'migration'

// Why: field-for-field the workbench `ProjectGroup` projection so catalog
// callers can adopt the protobuf client without a mapping layer.
export type ProjectGroupValue = {
  id: string
  name: string
  parentPath: string | null
  connectionId?: string | null
  parentGroupId: string | null
  createdFrom: ProjectGroupCreatedFromValue
  tabOrder: number
  isCollapsed: boolean
  color: string | null
  createdAt: number
  updatedAt: number
}

export type ProjectGroupRepoValue = {
  id: string
  path: string
  displayName: string
  badgeColor: string
  executionHostId: string
  addedAt: number
  kind?: 'git' | 'folder'
  externalWorktreeVisibility?: 'hide' | 'show'
  projectGroupId?: string | null
  projectGroupOrder?: number
  gitRemoteIdentity?: {
    canonicalKey: string
    remoteName: string
    remoteUrl: string
  } | null
}

export type ProjectGroupImportModeValue = 'group' | 'separate'
export type ProjectGroupImportStatusValue = 'imported' | 'already-known' | 'failed'

export type ProjectGroupImportProjectResultValue = {
  path: string
  projectId?: string
  status: ProjectGroupImportStatusValue
  error?: string
}

export type ProjectGroupImportResultValue = {
  group?: ProjectGroupValue
  projects: ProjectGroupImportProjectResultValue[]
  importedCount: number
  alreadyKnownCount: number
  failedCount: number
  revision: number
}

export type ProjectGroupEventValue =
  | { type: 'ready'; subscriptionId: string }
  | { type: 'progress'; scanId: string; scan: NestedRepoScanResultValue }

export type ProjectGroupCreateInput = {
  expectedRevision: number
  name: string
  parentPath?: string
  parentGroupId?: string
  connectionId?: string
  createdFrom?: ProjectGroupCreatedFromValue
}

export type ProjectGroupUpdateFieldsInput = {
  name?: string
  isCollapsed?: boolean
  tabOrder?: number
  // Why: color clears with an explicit null and stays untouched when absent,
  // matching the legacy surface's nullable update semantics.
  color?: string | null
}

export type ProjectGroupUpdateInput = {
  expectedRevision: number
  groupId: string
  updates: ProjectGroupUpdateFieldsInput
}

export type ProjectGroupSelectorInput = { expectedRevision: number; groupId: string }

export type ProjectGroupMoveProjectInput = {
  expectedRevision: number
  repo: string
  groupId?: string
  order?: number
}

export type ProjectGroupScanInput = {
  path: string
  scanId?: string
  options?: { maxDepth?: number; maxRepos?: number; timeoutMs?: number }
}

export type ProjectGroupImportNestedInput = {
  expectedRevision: number
  parentPath: string
  groupName: string
  projectPaths: string[]
  mode: ProjectGroupImportModeValue
  scanId?: string
}

export function projectGroupValue(value: ProjectGroupMessage): ProjectGroupValue {
  return {
    id: required(value.id, 'Project group ID'),
    name: value.name,
    parentPath: value.parentPath ?? null,
    ...(value.connectionId === undefined ? {} : { connectionId: value.connectionId }),
    parentGroupId: value.parentGroupId ?? null,
    createdFrom: createdFrom(value.createdFrom),
    tabOrder: value.tabOrder,
    isCollapsed: value.isCollapsed,
    color: value.color ?? null,
    createdAt: epochMs(value.createdAt),
    updatedAt: epochMs(value.updatedAt)
  }
}

function createdFrom(value: ProjectGroupCreatedFrom): ProjectGroupCreatedFromValue {
  switch (value) {
    case ProjectGroupCreatedFrom.FOLDER_SCAN:
      return 'folder-scan'
    case ProjectGroupCreatedFrom.MANUAL:
      return 'manual'
    case ProjectGroupCreatedFrom.MIGRATION:
      return 'migration'
    case ProjectGroupCreatedFrom.UNSPECIFIED:
      break
  }
  throw invalidResponse('Project group created-from value is missing')
}

export function protocolCreatedFrom(value: ProjectGroupCreatedFromValue): ProjectGroupCreatedFrom {
  switch (value) {
    case 'folder-scan':
      return ProjectGroupCreatedFrom.FOLDER_SCAN
    case 'manual':
      return ProjectGroupCreatedFrom.MANUAL
    case 'migration':
      return ProjectGroupCreatedFrom.MIGRATION
  }
}

export function protocolImportMode(value: ProjectGroupImportModeValue): ProjectGroupImportMode {
  switch (value) {
    case 'group':
      return ProjectGroupImportMode.GROUP
    case 'separate':
      return ProjectGroupImportMode.SEPARATE
  }
}

export function importResult(
  value: ProjectGroupServiceImportNestedResponse
): ProjectGroupImportResultValue {
  return {
    ...(value.group ? { group: projectGroupValue(value.group) } : {}),
    projects: value.projects.map(importProjectResult),
    importedCount: value.importedCount,
    alreadyKnownCount: value.alreadyKnownCount,
    failedCount: value.failedCount,
    revision: revision(value.revision)
  }
}

function importProjectResult(
  value: ProjectGroupServiceImportProjectResult
): ProjectGroupImportProjectResultValue {
  return {
    path: value.path,
    ...(value.projectId === undefined ? {} : { projectId: value.projectId }),
    status: importStatus(value.status),
    ...(value.error === undefined ? {} : { error: value.error })
  }
}

function importStatus(value: ProjectGroupImportStatus): ProjectGroupImportStatusValue {
  switch (value) {
    case ProjectGroupImportStatus.IMPORTED:
      return 'imported'
    case ProjectGroupImportStatus.ALREADY_KNOWN:
      return 'already-known'
    case ProjectGroupImportStatus.FAILED:
      return 'failed'
    case ProjectGroupImportStatus.UNSPECIFIED:
      break
  }
  throw invalidResponse('Project group import status is missing')
}

export function moveProjectRepo(value: ProjectGroupServiceMoveProjectResponse): {
  repo?: ProjectGroupRepoValue
  revision: number
} {
  return {
    ...(value.repo ? { repo: projectGroupRepo(value.repo) } : {}),
    revision: revision(value.revision)
  }
}

function projectGroupRepo(value: ProjectGroupRepoMessage): ProjectGroupRepoValue {
  return {
    id: required(value.id, 'Repository ID'),
    path: value.path,
    displayName: value.displayName,
    badgeColor: value.badgeColor,
    executionHostId: value.executionHostId,
    addedAt: epochMs(value.addedAt),
    ...(value.kind === RepoKind.UNSPECIFIED ? {} : { kind: repoKind(value.kind) }),
    ...(value.externalWorktreeVisibility === RepoExternalWorktreeVisibility.UNSPECIFIED
      ? {}
      : { externalWorktreeVisibility: worktreeVisibility(value.externalWorktreeVisibility) }),
    ...(value.projectGroupId === undefined ? {} : { projectGroupId: value.projectGroupId }),
    ...(value.projectGroupOrder === undefined
      ? {}
      : { projectGroupOrder: value.projectGroupOrder }),
    ...(value.gitRemoteIdentity === undefined ? {} : { gitRemoteIdentity: value.gitRemoteIdentity })
  }
}

function repoKind(value: RepoKind): 'git' | 'folder' {
  switch (value) {
    case RepoKind.GIT:
      return 'git'
    case RepoKind.FOLDER:
      return 'folder'
    case RepoKind.UNSPECIFIED:
      break
  }
  throw invalidResponse('Repository kind is missing')
}

function worktreeVisibility(value: RepoExternalWorktreeVisibility): 'hide' | 'show' {
  switch (value) {
    case RepoExternalWorktreeVisibility.HIDE:
      return 'hide'
    case RepoExternalWorktreeVisibility.SHOW:
      return 'show'
    case RepoExternalWorktreeVisibility.UNSPECIFIED:
      break
  }
  throw invalidResponse('Repository external-worktree visibility is missing')
}

export function revision(value: bigint): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new TypeError('Catalog revision is outside the nonnegative safe integer range')
  }
  return number
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

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
