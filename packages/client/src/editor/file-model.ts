import type {
  GitBranchChangeEntry,
  GitBranchCompareSummary
} from '@yiru/protocol/git/branch-compare-types'
import type { GitCommitCompareSummary } from '@yiru/protocol/git/compare-values'
import type {
  GitConflictKind,
  GitConflictResolutionStatus,
  GitConflictStatusSource,
  GitStatusEntry
} from '@yiru/protocol/git/status-types'
import type { GlobalSettings } from '@yiru/protocol/settings/global/model'

import type { OpenCheckRunDetailsState } from './check-run-details-tab'

export type DiffSource =
  | 'unstaged'
  | 'staged'
  | 'branch'
  | 'commit'
  | 'combined-all'
  | 'combined-uncommitted'
  | 'combined-branch'
  | 'combined-commit'

export type BranchCompareSnapshot = Pick<
  GitBranchCompareSummary,
  'baseRef' | 'baseOid' | 'compareRef' | 'headOid' | 'mergeBase'
> & {
  compareVersion: string
}

export type CommitCompareSnapshot = Pick<
  GitCommitCompareSummary,
  'commitOid' | 'parentOid' | 'compareRef' | 'baseRef'
> & {
  compareVersion: string
  subject?: string
  message?: string
}

export type BranchCompareLike = Pick<
  GitBranchCompareSummary,
  'baseRef' | 'baseOid' | 'compareRef' | 'headOid' | 'mergeBase'
>

export type CommitCompareLike = Pick<
  GitCommitCompareSummary,
  'commitOid' | 'parentOid' | 'compareRef' | 'baseRef'
> & {
  subject?: string
  message?: string
}

export type CombinedDiffAlternate = {
  source: 'combined-all' | 'combined-branch'
  branchCompare?: BranchCompareSnapshot
}

export type OpenConflictMetadata = {
  kind: 'conflict-editable' | 'conflict-placeholder'
  conflictKind: GitConflictKind
  conflictStatus: GitConflictResolutionStatus
  conflictStatusSource: GitConflictStatusSource
  message?: string
  guidance?: string
}

export type ConflictReviewEntry = {
  path: string
  conflictKind: GitConflictKind
}

export type ConflictReviewState = {
  source: 'live-summary' | 'combined-diff-exclusion'
  snapshotTimestamp: number
  entries: ConflictReviewEntry[]
  selectedFileId?: string
}

export type CombinedDiffSkippedConflict = {
  path: string
  conflictKind: GitConflictKind
}

// Why: one uniform tab model keeps reorder/close/activate plumbing independent
// of editor mode; mode-specific consumers must still validate filePath semantics.
export type OpenFile = {
  id: string
  filePath: string
  relativePath: string
  worktreeId: string
  language: string
  isDirty: boolean
  runtimeEnvironmentId?: string | null
  markdownPreviewSourceFileId?: string
  markdownPreviewAnchor?: string
  diffSource?: DiffSource
  branchCompare?: BranchCompareSnapshot
  commitCompare?: CommitCompareSnapshot
  branchOldPath?: string
  combinedAlternate?: CombinedDiffAlternate
  combinedAreaFilter?: string
  branchEntriesSnapshot?: GitBranchChangeEntry[]
  commitEntriesSnapshot?: GitBranchChangeEntry[]
  uncommittedEntriesSnapshot?: GitStatusEntry[]
  conflict?: OpenConflictMetadata
  skippedConflicts?: CombinedDiffSkippedConflict[]
  conflictReview?: ConflictReviewState
  isPreview?: boolean
  isUntitled?: boolean
  deleteUntouchedOnClose?: boolean
  externalMutation?: 'deleted' | 'renamed' | 'changed'
  lastKnownDiskSignature?: string
  pendingDiskBaselineVerification?: boolean
  diffContentReloadNonce?: number
  fileContentReloadNonce?: number
  checkRunDetails?: OpenCheckRunDetailsState
  mirroredFromRuntimeSession?: boolean
  readOnly?: boolean
  liveTail?: boolean
  mode: 'edit' | 'diff' | 'conflict-review' | 'markdown-preview' | 'check-details'
}

export type ActivityBarPosition = 'top' | 'side'

export type MarkdownViewMode = 'source' | 'rich' | 'preview'

export type EditorViewMode = 'edit' | 'changes'

export type ClosedEditorTabSnapshot = Omit<
  OpenFile,
  'id' | 'isDirty' | 'mirroredFromRuntimeSession'
>

export const MAX_RECENT_CLOSED_EDITOR_TABS = 10

export type EditorOpenTargetOptions = {
  targetGroupId?: string
  workspacePanelTabId?: string
  preview?: boolean
  runtimeEnvironmentId?: string | null
  forceContentReload?: boolean
}

export type WorkspacePanelEditorOpenOptions = Pick<EditorOpenTargetOptions, 'workspacePanelTabId'>

export type GitRuntimeOperationOptions = {
  runtimeTargetSettings?: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null
  applyUpstreamStatus?: boolean
}

export type PendingEditorReveal = {
  filePath: string
  fileId?: string
  line: number
  column: number
  matchLength: number
}
