import { create } from '@bufbuild/protobuf'

import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  FolderWorkspaceLinkedReviewSchema,
  FolderWorkspacePathScope,
  FolderWorkspacePathStatusReason as ProtocolPathStatusReason,
  FolderWorkspaceReviewKind as ProtocolReviewKind,
  FolderWorkspaceReviewProvider as ProtocolReviewProvider,
  type FolderWorkspaceLinkedReview as ProtocolLinkedReview,
  type FolderWorkspaceNullableText as ProtocolNullableText,
  type FolderWorkspacePathStatus as ProtocolPathStatus,
  type FolderWorkspace as ProtocolFolderWorkspace
} from '../generated/yiru/runtime/v1/folder_workspace_pb.js'
import { RuntimeProtocolError } from './error.js'
import type { RepoAgentValue } from './repo-types.js'

export const FOLDER_WORKSPACE_PROTOCOL_CAPABILITY = 'folderWorkspace.protobuf.v1' as const

// Why: field-for-field the workbench `FolderWorkspace` projection so catalog
// callers can adopt the protobuf client without a mapping layer.
export type FolderWorkspaceValue = {
  id: string
  projectGroupId: string
  name: string
  folderPath: string
  connectionId?: string | null
  linkedReview: FolderWorkspaceLinkedReviewValue | null
  comment: string
  isArchived: boolean
  isUnread: boolean
  isPinned: boolean
  sortOrder: number
  manualOrder?: number
  workspaceStatus?: string
  createdWithAgent?: RepoAgentValue
  pendingFirstAgentMessageRename?: boolean
  firstAgentMessageRenameError?: string | null
  lastActivityAt: number
  createdAt: number
  updatedAt: number
}

export type FolderWorkspaceLinkedReviewValue = {
  provider: 'github'
  type: 'pr'
  number: number
  title: string
  url: string
  repoId?: string
}

export type FolderWorkspacePathStatusValue = {
  path: string
  exists: boolean
  reason?: 'missing' | 'not-directory' | 'unavailable'
}

export type FolderWorkspaceCreateInput = {
  expectedRevision: number
  projectGroupId: string
  name?: string
  folderPath?: string | null
  connectionId?: string | null
  linkedReview?: FolderWorkspaceLinkedReviewValue | null
  createdWithAgent?: RepoAgentValue
  pendingFirstAgentMessageRename?: boolean
}

export type FolderWorkspaceUpdateFieldsInput = {
  name?: string
  comment?: string
  folderPath?: string
  workspaceStatus?: string
  createdWithAgent?: RepoAgentValue
  manualOrder?: number
  sortOrder?: number
  lastActivityAt?: number
  isArchived?: boolean
  isPinned?: boolean
  isUnread?: boolean
  pendingFirstAgentMessageRename?: boolean
  // Why: linkedReview clears with an explicit null and stays untouched when
  // absent, matching the legacy surface's nullable update semantics.
  linkedReview?: FolderWorkspaceLinkedReviewValue | null
  firstAgentMessageRenameError?: string | null
}

export type FolderWorkspaceUpdateInput = {
  expectedRevision: number
  folderWorkspaceId: string
  updates: FolderWorkspaceUpdateFieldsInput
}

export type FolderWorkspaceSelectorInput = {
  expectedRevision: number
  folderWorkspaceId: string
}

export type FolderWorkspacePathStatusRequestInput =
  | { scope: 'folder-workspace'; folderWorkspaceId: string }
  | { scope: 'project-group'; projectGroupId: string }
  | { scope: 'path'; path: string }

const AGENTS = [
  'claude',
  'openclaude',
  'codex',
  'autohand',
  'opencode',
  'mimo-code',
  'pi',
  'omp',
  'gemini',
  'antigravity',
  'aider',
  'goose',
  'amp',
  'kilo',
  'kiro',
  'crush',
  'aug',
  'cline',
  'codebuff',
  'command-code',
  'continue',
  'cursor',
  'droid',
  'kimi',
  'mistral-vibe',
  'qwen-code',
  'rovo',
  'hermes',
  'openclaw',
  'copilot',
  'grok',
  'devin',
  'ante',
  'trae'
] as const satisfies readonly RepoAgentValue[]

export function folderWorkspaceValue(value: ProtocolFolderWorkspace): FolderWorkspaceValue {
  return {
    id: required(value.id, 'Folder workspace ID'),
    projectGroupId: required(value.projectGroupId, 'Folder workspace project group ID'),
    name: value.name,
    folderPath: value.folderPath,
    connectionId: value.connectionId ?? null,
    linkedReview: value.linkedReview ? linkedReview(value.linkedReview) : null,
    comment: value.comment,
    isArchived: value.isArchived,
    isUnread: value.isUnread,
    isPinned: value.isPinned,
    sortOrder: value.sortOrder,
    ...(value.manualOrder === undefined ? {} : { manualOrder: value.manualOrder }),
    ...(value.workspaceStatus === undefined ? {} : { workspaceStatus: value.workspaceStatus }),
    ...(value.createdWithAgent === undefined
      ? {}
      : { createdWithAgent: createdWithAgent(value.createdWithAgent) }),
    ...(value.pendingFirstAgentMessageRename === undefined
      ? {}
      : { pendingFirstAgentMessageRename: value.pendingFirstAgentMessageRename }),
    ...(value.firstAgentMessageRenameError === undefined
      ? {}
      : { firstAgentMessageRenameError: nullableText(value.firstAgentMessageRenameError) }),
    lastActivityAt: value.lastActivityAt,
    createdAt: epochMs(value.createdAt),
    updatedAt: epochMs(value.updatedAt)
  }
}

export function folderWorkspacePathStatus(
  value: ProtocolPathStatus
): FolderWorkspacePathStatusValue {
  return {
    path: value.path,
    exists: value.exists,
    ...(value.reason === undefined ? {} : { reason: pathStatusReason(value.reason) })
  }
}

// Why: the legacy projection serializes the rename error only once a rename was
// attempted; the oneof keeps "no error" (null) apart from "not attempted"
// (absent), and the decoded value keeps exactly those three states.
export function nullableText(value: ProtocolNullableText): string | null {
  switch (value.value.case) {
    case 'null':
      return null
    case 'text':
      return value.value.value
    case undefined:
      throw invalidResponse('Folder workspace rename error state is missing')
  }
}

export function protocolLinkedReview(
  value: FolderWorkspaceLinkedReviewValue
): ProtocolLinkedReview {
  return create(FolderWorkspaceLinkedReviewSchema, {
    provider: ProtocolReviewProvider.GITHUB,
    kind: ProtocolReviewKind.PULL_REQUEST,
    number: value.number,
    title: value.title,
    url: value.url,
    ...(value.repoId === undefined ? {} : { repoId: value.repoId })
  })
}

export function protocolPathScope(request: FolderWorkspacePathStatusRequestInput): {
  scope: FolderWorkspacePathScope
  path?: string
  projectGroupId?: string
  folderWorkspaceId?: string
} {
  switch (request.scope) {
    case 'path':
      return { scope: FolderWorkspacePathScope.PATH, path: request.path }
    case 'project-group':
      return {
        scope: FolderWorkspacePathScope.PROJECT_GROUP,
        projectGroupId: request.projectGroupId
      }
    case 'folder-workspace':
      return {
        scope: FolderWorkspacePathScope.FOLDER_WORKSPACE,
        folderWorkspaceId: request.folderWorkspaceId
      }
  }
}

function linkedReview(value: ProtocolLinkedReview): FolderWorkspaceLinkedReviewValue {
  if (value.provider !== ProtocolReviewProvider.GITHUB) {
    throw invalidResponse('Folder workspace linked review provider is invalid')
  }
  if (value.kind !== ProtocolReviewKind.PULL_REQUEST) {
    throw invalidResponse('Folder workspace linked review type is invalid')
  }
  return {
    provider: 'github',
    type: 'pr',
    number: value.number,
    title: value.title,
    url: required(value.url, 'Folder workspace linked review URL'),
    ...(value.repoId === undefined ? {} : { repoId: value.repoId })
  }
}

function createdWithAgent(value: string): RepoAgentValue {
  const found = AGENTS.find((candidate) => candidate === value)
  if (!found) {
    throw invalidResponse('Folder workspace agent identity is invalid')
  }
  return found
}

function pathStatusReason(
  value: ProtocolPathStatusReason
): FolderWorkspacePathStatusValue['reason'] {
  switch (value) {
    case ProtocolPathStatusReason.MISSING:
      return 'missing'
    case ProtocolPathStatusReason.NOT_DIRECTORY:
      return 'not-directory'
    case ProtocolPathStatusReason.UNAVAILABLE:
      return 'unavailable'
    case ProtocolPathStatusReason.UNSPECIFIED:
      break
  }
  throw invalidResponse('Folder workspace path status reason is missing')
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
