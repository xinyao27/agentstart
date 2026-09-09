import type {
  GitChangeStatus,
  GitChangeEntry as ProtocolChangeEntry
} from '../../generated/yiru/runtime/v1/git_common_pb.js'
import {
  GitCompareStatus as ProtocolCompareStatus,
  type GitCompareResult as ProtocolCompareResult
} from '../../generated/yiru/runtime/v1/git_history_pb.js'
import { fileStatusFromProto } from './status-values.js'

export type GitBranchChangeStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'copied'
export type GitBranchChangeEntry = {
  path: string
  status: GitBranchChangeStatus
  oldPath?: string
  added?: number
  removed?: number
}
export type GitCompareStatus =
  | 'ready'
  | 'invalid-base'
  | 'unborn-head'
  | 'no-merge-base'
  | 'invalid-commit'
  | 'error'
export type GitBranchCompareSummary = {
  baseRef: string
  baseOid: string | null
  compareRef: string
  headOid: string | null
  mergeBase: string | null
  changedFiles: number
  commitsAhead?: number
  status: Exclude<GitCompareStatus, 'invalid-commit'>
  errorMessage?: string
}
export type GitBranchCompareResult = {
  summary: GitBranchCompareSummary
  entries: GitBranchChangeEntry[]
}
export type GitCommitCompareSummary = {
  commitOid: string
  parentOid: string | null
  compareRef: string
  baseRef: string
  changedFiles: number
  status: Extract<GitCompareStatus, 'ready' | 'invalid-commit' | 'error'>
  errorMessage?: string
}
export type GitCommitCompareResult = {
  summary: GitCommitCompareSummary
  entries: GitBranchChangeEntry[]
}

function branchChangeStatusFromProto(value: GitChangeStatus): GitBranchChangeStatus {
  const status = fileStatusFromProto(value)
  return status === 'untracked' ? 'modified' : status
}

function changeEntryFromProto(entry: ProtocolChangeEntry): GitBranchChangeEntry {
  return {
    path: entry.path,
    status: branchChangeStatusFromProto(entry.status),
    ...(entry.oldPath ? { oldPath: entry.oldPath } : {}),
    ...(entry.added !== undefined ? { added: Number(entry.added) } : {}),
    ...(entry.removed !== undefined ? { removed: Number(entry.removed) } : {})
  }
}

export function gitBranchCompareResultFromProto(
  compare: ProtocolCompareResult
): GitBranchCompareResult {
  const summary = compare.summary
  return {
    summary: {
      baseRef: summary?.baseRef ?? '',
      baseOid: summary?.baseOid ?? null,
      compareRef: summary?.compareRef ?? '',
      headOid: summary?.headOid ?? null,
      mergeBase: summary?.mergeBase ?? null,
      changedFiles: Number(summary?.changedFiles ?? 0),
      ...(summary?.commitsAhead !== undefined
        ? { commitsAhead: Number(summary.commitsAhead) }
        : {}),
      status: branchCompareStatusFromProto(summary?.status),
      ...(summary?.errorMessage ? { errorMessage: summary.errorMessage } : {})
    },
    entries: compare.entries.map(changeEntryFromProto)
  }
}

export function gitCommitCompareResultFromProto(
  compare: ProtocolCompareResult
): GitCommitCompareResult {
  const summary = compare.summary
  return {
    summary: {
      commitOid: summary?.commitOid ?? '',
      parentOid: summary?.parentOid ?? null,
      compareRef: summary?.compareRef ?? '',
      baseRef: summary?.baseRef ?? '',
      changedFiles: Number(summary?.changedFiles ?? 0),
      status: commitCompareStatusFromProto(summary?.status),
      ...(summary?.errorMessage ? { errorMessage: summary.errorMessage } : {})
    },
    entries: compare.entries.map(changeEntryFromProto)
  }
}

function branchCompareStatusFromProto(
  value: ProtocolCompareStatus | undefined
): GitBranchCompareSummary['status'] {
  switch (value) {
    case ProtocolCompareStatus.READY:
      return 'ready'
    case ProtocolCompareStatus.UNBORN_HEAD:
      return 'unborn-head'
    case ProtocolCompareStatus.INVALID_BASE:
      return 'invalid-base'
    case ProtocolCompareStatus.NO_MERGE_BASE:
      return 'no-merge-base'
    // Why: commit-only and unknown statuses never ride the branch-compare
    // path; folding them into the summary's error keeps the narrowed union.
    default:
      return 'error'
  }
}

function commitCompareStatusFromProto(
  value: ProtocolCompareStatus | undefined
): GitCommitCompareSummary['status'] {
  switch (value) {
    case ProtocolCompareStatus.READY:
      return 'ready'
    case ProtocolCompareStatus.INVALID_COMMIT:
      return 'invalid-commit'
    // Why: branch-only and unknown statuses never ride the commit-compare path.
    default:
      return 'error'
  }
}
