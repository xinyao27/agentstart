import { create } from '@bufbuild/protobuf'

import {
  GitChangeStatus,
  GitConflictKind,
  GitConflictOperation as ProtocolConflictOperation,
  GitPushTargetSchema,
  GitStatusArea,
  type GitPushTarget as ProtocolPushTarget,
  type GitStatusEntry as ProtocolStatusEntry,
  type GitUpstreamStatus as ProtocolUpstreamStatus
} from '../../generated/yiru/runtime/v1/git_common_pb.js'
import type { GitWorkingStatus as ProtocolWorkingStatus } from '../../generated/yiru/runtime/v1/git_status_pb.js'

export type GitFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'copied'
export type GitStagingArea = 'staged' | 'unstaged' | 'untracked'
export type GitConflictKindValue =
  | 'both_modified'
  | 'both_added'
  | 'both_deleted'
  | 'added_by_us'
  | 'added_by_them'
  | 'deleted_by_us'
  | 'deleted_by_them'
export type GitConflictOperation = 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'unknown'

export type GitSubmoduleStatus = {
  commitChanged: boolean
  trackedChanges: boolean
  untrackedChanges: boolean
}

export type GitStatusEntry = {
  path: string
  status: GitFileStatus
  area: GitStagingArea
  oldPath?: string
  conflictKind?: GitConflictKindValue
  conflictStatus?: 'unresolved'
  submodule?: GitSubmoduleStatus
  added?: number
  removed?: number
}

export type GitUpstreamStatus = {
  hasUpstream: boolean
  upstreamName?: string
  ahead: number
  behind: number
  hasConfiguredPushTarget?: boolean
  behindCommitsArePatchEquivalent?: boolean
}

export type GitStatusResult = {
  entries: GitStatusEntry[]
  conflictOperation: GitConflictOperation
  head?: string
  branch?: string
  upstreamStatus?: GitUpstreamStatus
  ignoredPaths?: string[]
  didHitLimit?: boolean
  statusLength?: number
}

export type GitPushTarget = {
  remoteName: string
  branchName: string
  remoteUrl?: string
}

export function gitPushTargetToProto(
  target: GitPushTarget | undefined
): ProtocolPushTarget | undefined {
  if (!target) {
    return undefined
  }
  return create(GitPushTargetSchema, {
    remoteName: target.remoteName,
    branchName: target.branchName,
    remoteUrl: target.remoteUrl
  })
}

export function gitConflictOperationFromProto(
  value: ProtocolConflictOperation
): GitConflictOperation {
  switch (value) {
    case ProtocolConflictOperation.MERGE:
      return 'merge'
    case ProtocolConflictOperation.REBASE:
      return 'rebase'
    case ProtocolConflictOperation.CHERRY_PICK:
      return 'cherry-pick'
    case ProtocolConflictOperation.REVERT:
      return 'revert'
    default:
      return 'unknown'
  }
}

export function fileStatusFromProto(value: GitChangeStatus): GitFileStatus {
  switch (value) {
    case GitChangeStatus.ADDED:
      return 'added'
    case GitChangeStatus.DELETED:
      return 'deleted'
    case GitChangeStatus.RENAMED:
      return 'renamed'
    case GitChangeStatus.COPIED:
      return 'copied'
    case GitChangeStatus.UNTRACKED:
      return 'untracked'
    default:
      return 'modified'
  }
}

function stagingAreaFromProto(value: GitStatusArea): GitStagingArea {
  switch (value) {
    case GitStatusArea.STAGED:
      return 'staged'
    case GitStatusArea.UNTRACKED:
      return 'untracked'
    default:
      return 'unstaged'
  }
}

function conflictKindFromProto(value: GitConflictKind): GitConflictKindValue | undefined {
  switch (value) {
    case GitConflictKind.BOTH_MODIFIED:
      return 'both_modified'
    case GitConflictKind.BOTH_ADDED:
      return 'both_added'
    case GitConflictKind.BOTH_DELETED:
      return 'both_deleted'
    case GitConflictKind.ADDED_BY_US:
      return 'added_by_us'
    case GitConflictKind.ADDED_BY_THEM:
      return 'added_by_them'
    case GitConflictKind.DELETED_BY_US:
      return 'deleted_by_us'
    case GitConflictKind.DELETED_BY_THEM:
      return 'deleted_by_them'
    default:
      return undefined
  }
}

function statusEntryFromProto(entry: ProtocolStatusEntry): GitStatusEntry {
  const conflictKind = conflictKindFromProto(entry.conflictKind ?? GitConflictKind.UNSPECIFIED)
  return {
    path: entry.path,
    status: fileStatusFromProto(entry.status),
    area: stagingAreaFromProto(entry.area),
    ...(entry.oldPath ? { oldPath: entry.oldPath } : {}),
    ...(conflictKind ? { conflictKind, conflictStatus: 'unresolved' as const } : {}),
    ...(entry.submodule
      ? {
          submodule: {
            commitChanged: entry.submodule.commitChanged,
            trackedChanges: entry.submodule.trackedChanges,
            untrackedChanges: entry.submodule.untrackedChanges
          }
        }
      : {}),
    ...(entry.added !== undefined ? { added: Number(entry.added) } : {}),
    ...(entry.removed !== undefined ? { removed: Number(entry.removed) } : {})
  }
}

export function gitUpstreamStatusFromProto(status: ProtocolUpstreamStatus): GitUpstreamStatus {
  return {
    hasUpstream: status.hasUpstream,
    ...(status.upstreamName ? { upstreamName: status.upstreamName } : {}),
    ahead: Number(status.ahead),
    behind: Number(status.behind),
    ...(status.hasConfiguredPushTarget !== undefined
      ? { hasConfiguredPushTarget: status.hasConfiguredPushTarget }
      : {}),
    ...(status.behindCommitsArePatchEquivalent !== undefined
      ? { behindCommitsArePatchEquivalent: status.behindCommitsArePatchEquivalent }
      : {})
  }
}

export function gitWorkingStatusFromProto(status: ProtocolWorkingStatus): GitStatusResult {
  return {
    entries: status.entries.map(statusEntryFromProto),
    conflictOperation: gitConflictOperationFromProto(status.conflictOperation),
    ...(status.head ? { head: status.head } : {}),
    ...(status.branch ? { branch: status.branch } : {}),
    ...(status.upstreamStatus
      ? { upstreamStatus: gitUpstreamStatusFromProto(status.upstreamStatus) }
      : {}),
    ...(status.ignoredPaths.length > 0 ? { ignoredPaths: status.ignoredPaths } : {}),
    ...(status.didHitLimit !== undefined ? { didHitLimit: status.didHitLimit } : {}),
    ...(status.statusLength !== undefined ? { statusLength: Number(status.statusLength) } : {})
  }
}
