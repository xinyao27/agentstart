import type { GitStatusEntry } from '@agentstart/protocol/git/status-types'

import type { RemoteOpKind } from './primary-action'

type AbortActionErrorKind = 'abort_merge' | 'abort_rebase'
type SourceControlActionErrorKind = RemoteOpKind | AbortActionErrorKind
export type SourceControlRecoveryStatusEntry = Pick<GitStatusEntry, 'path' | 'status' | 'area'>

const SOURCE_CONTROL_ACTION_ERROR_ENTRY_SNAPSHOT_LIMIT = 120

export type SourceControlActionError = {
  kind: SourceControlActionErrorKind
  message: string
  rawError: string
  syncPushStage?: boolean
  branchName?: string | null
  worktreePath?: string | null
  entriesSnapshot?: SourceControlRecoveryStatusEntry[]
  entriesSnapshotTotalCount?: number
  sequence?: number
}

export type SourceControlRecoveryEntrySnapshot = {
  entries: SourceControlRecoveryStatusEntry[]
  totalCount: number
}

export function captureSourceControlRecoveryEntrySnapshot(
  entries: readonly SourceControlRecoveryStatusEntry[]
): SourceControlRecoveryEntrySnapshot {
  return {
    entries: entries.slice(0, SOURCE_CONTROL_ACTION_ERROR_ENTRY_SNAPSHOT_LIMIT),
    totalCount: entries.length
  }
}
