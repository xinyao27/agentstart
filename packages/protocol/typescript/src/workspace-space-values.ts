import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  WorkspaceSpaceItemKind,
  type WorkspaceSpaceAnalysis,
  type WorkspaceSpaceItem
} from '../generated/agent_start/runtime/v1/workspace_space_pb.js'
import { RuntimeProtocolError } from './error.js'
import { safeNumber } from './shell-state-values.js'

export const WORKSPACE_SPACE_PROTOCOL_CAPABILITY = 'workspaceSpace.protobuf.v1' as const

export type WorkspaceSpaceScanStatusName =
  | 'ok'
  | 'missing'
  | 'permission-denied'
  | 'unavailable'
  | 'error'

export type WorkspaceSpaceItemValue = Readonly<{
  name: string
  path: string
  kind: 'directory' | 'file' | 'symlink' | 'other'
  sizeBytes: number
}>

export type WorkspaceSpaceWorktreeValue = Readonly<{
  worktreeId: string
  repoId: string
  repoDisplayName: string
  repoPath: string
  displayName: string
  path: string
  branch: string
  isMainWorktree: boolean
  isRemote: boolean
  isSparse: boolean
  canDelete: boolean
  lastActivityAt: number
  status: WorkspaceSpaceScanStatusName
  error: string | null
  scannedAt: number
  sizeBytes: number
  reclaimableBytes: number
  skippedEntryCount: number
  topLevelItems: WorkspaceSpaceItemValue[]
  omittedTopLevelItemCount: number
  omittedTopLevelSizeBytes: number
}>

export type WorkspaceSpaceRepoSummaryValue = Readonly<{
  repoId: string
  displayName: string
  path: string
  isRemote: boolean
  worktreeCount: number
  scannedWorktreeCount: number
  unavailableWorktreeCount: number
  totalSizeBytes: number
  reclaimableBytes: number
  error: string | null
}>

export type WorkspaceSpaceAnalysisValue = Readonly<{
  scannedAt: number
  totalSizeBytes: number
  reclaimableBytes: number
  worktreeCount: number
  scannedWorktreeCount: number
  unavailableWorktreeCount: number
  repos: WorkspaceSpaceRepoSummaryValue[]
  worktrees: WorkspaceSpaceWorktreeValue[]
}>

export function workspaceSpaceAnalysis(value: WorkspaceSpaceAnalysis): WorkspaceSpaceAnalysisValue {
  return {
    scannedAt: safeNumber(value.scannedAt, 'Workspace space scan timestamp'),
    totalSizeBytes: safeBig(value.totalSizeBytes, 'Workspace space total size'),
    reclaimableBytes: safeBig(value.reclaimableBytes, 'Workspace space reclaimable size'),
    worktreeCount: value.worktreeCount,
    scannedWorktreeCount: value.scannedWorktreeCount,
    unavailableWorktreeCount: value.unavailableWorktreeCount,
    repos: value.repos.map((repo) => ({
      repoId: repo.repoId,
      displayName: repo.displayName,
      path: repo.path,
      isRemote: repo.isRemote,
      worktreeCount: repo.worktreeCount,
      scannedWorktreeCount: repo.scannedWorktreeCount,
      unavailableWorktreeCount: repo.unavailableWorktreeCount,
      totalSizeBytes: safeBig(repo.totalSizeBytes, 'Workspace space repo size'),
      reclaimableBytes: safeBig(repo.reclaimableBytes, 'Workspace space repo reclaimable size'),
      error: repo.error ?? null
    })),
    worktrees: value.worktrees.map((worktree) => ({
      worktreeId: worktree.worktreeId,
      repoId: worktree.repoId,
      repoDisplayName: worktree.repoDisplayName,
      repoPath: worktree.repoPath,
      displayName: worktree.displayName,
      path: worktree.path,
      branch: worktree.branch,
      isMainWorktree: worktree.isMainWorktree,
      isRemote: worktree.isRemote,
      isSparse: worktree.isSparse,
      canDelete: worktree.canDelete,
      lastActivityAt: safeNumber(worktree.lastActivityAt, 'Workspace space activity timestamp'),
      status: scanStatus(worktree.status),
      error: worktree.error ?? null,
      scannedAt: safeNumber(worktree.scannedAt, 'Workspace space worktree timestamp'),
      sizeBytes: safeBig(worktree.sizeBytes, 'Workspace space worktree size'),
      reclaimableBytes: safeBig(
        worktree.reclaimableBytes,
        'Workspace space worktree reclaimable size'
      ),
      skippedEntryCount: worktree.skippedEntryCount,
      topLevelItems: worktree.topLevelItems.map(item),
      omittedTopLevelItemCount: worktree.omittedTopLevelItemCount,
      omittedTopLevelSizeBytes: safeBig(
        worktree.omittedTopLevelSizeBytes,
        'Workspace space omitted size'
      )
    }))
  }
}

function item(value: WorkspaceSpaceItem): WorkspaceSpaceItemValue {
  return {
    name: value.name,
    path: value.path,
    kind: itemKind(value.kind),
    sizeBytes: safeBig(value.sizeBytes, 'Workspace space item size')
  }
}

// Why: the item kind mirrors the host filesystem probe's closed four-way
// classification.
function itemKind(kind: WorkspaceSpaceItemKind): WorkspaceSpaceItemValue['kind'] {
  switch (kind) {
    case WorkspaceSpaceItemKind.DIRECTORY:
      return 'directory'
    case WorkspaceSpaceItemKind.FILE:
      return 'file'
    case WorkspaceSpaceItemKind.SYMLINK:
      return 'symlink'
    case WorkspaceSpaceItemKind.OTHER:
    case WorkspaceSpaceItemKind.UNSPECIFIED:
      return 'other'
  }
}

// Why: the status vocabulary is decided by the scan's failure classification
// at runtime, so unknown strings surface as the scan's own error state.
function scanStatus(status: string): WorkspaceSpaceScanStatusName {
  switch (status) {
    case 'ok':
    case 'missing':
    case 'permission-denied':
    case 'unavailable':
    case 'error':
      return status
    default:
      throw invalidResponse('Workspace space worktree status is unknown')
  }
}

function safeBig(value: bigint, label: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) {
    throw invalidResponse(`${label} is outside the safe integer range`)
  }
  return number
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
