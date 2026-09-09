import type {
  GitBranchChangeEntry,
  GitBranchCompareSummary
} from '@yiru/protocol/git/branch-compare-types'
import type { GitCommitCompareSummary } from '@yiru/protocol/git/compare-values'
import type { GitStatusEntry } from '@yiru/protocol/git/status-types'
import type { WorkspaceVisibleTabType } from '@yiru/protocol/workspace/tabs'

import type { OpenCheckRunDetailsState } from './check-run-details-tab'
import type {
  BranchCompareLike,
  ClosedEditorTabSnapshot,
  CombinedDiffAlternate,
  CommitCompareLike,
  ConflictReviewEntry,
  ConflictReviewState,
  EditorOpenTargetOptions,
  OpenFile,
  WorkspacePanelEditorOpenOptions
} from './file-model'
import type { HttpLinkSourceOwner } from './http-link-routing'

export type EditorFileSlice = {
  // Open files / editor tabs
  openFiles: OpenFile[]
  // Why: Explorer and Source Control own an editor inside their workspace tab;
  // keep that nested selection separate from top-level editor-tab activation.
  workspacePanelEditorFileIdByTab: Record<string, string>
  activeFileId: string | null
  activeFileIdByWorktree: Record<string, string | null> // worktreeId -> last active file
  activeTabTypeByWorktree: Record<string, WorkspaceVisibleTabType> // worktreeId -> last active tab type
  activeTabType: WorkspaceVisibleTabType
  setActiveTabType: (type: WorkspaceVisibleTabType) => void
  openFile: (
    file: Omit<OpenFile, 'id' | 'isDirty'>,
    options?: {
      preview?: boolean
      targetGroupId?: string
      recordReplacedPreview?: boolean
      suppressActiveRuntimeFallback?: boolean
      forceContentReload?: boolean
      workspacePanelTabId?: string
    }
  ) => void
  openNewMarkdownInActiveWorkspace: (groupId: string) => Promise<void>
  // Why: dispatcher for markdown link activation. Lives on the slice because it
  // sequences openFile, setMarkdownViewMode, and setPendingEditorReveal around
  // an async Monaco remount — all reading/writing state in this slice. See
  // docs/markdown-internal-link-opening-design.md.
  activateMarkdownLink: (
    rawHref: string | undefined,
    ctx: {
      sourceFilePath: string
      worktreeId: string
      worktreeRoot: string | null
      runtimeEnvironmentId?: string | null
      openInYiruBrowser?: boolean
      sourceOwner?: HttpLinkSourceOwner
    }
  ) => Promise<void>
  openMarkdownPreview: (
    file: Pick<
      OpenFile,
      'filePath' | 'relativePath' | 'worktreeId' | 'language' | 'runtimeEnvironmentId'
    >,
    options?: { anchor?: string | null; targetGroupId?: string; sourceFileId?: string }
  ) => void
  makePreviewFilePermanent: (fileId: string, tabId?: string) => void
  pinFile: (fileId: string, tabId?: string) => void
  closeFile: (fileId: string) => void
  closeAllFiles: () => void
  /** Most recently closed editor tabs per worktree (for Cmd/Ctrl+Shift+T). */
  recentlyClosedEditorTabsByWorktree: Record<string, ClosedEditorTabSnapshot[]>
  reopenClosedEditorTab: (worktreeId: string) => boolean
  setActiveFile: (fileId: string) => void
  reorderFiles: (fileIds: string[]) => void
  markFileDirty: (fileId: string, dirty: boolean) => void
  setExternalMutation: (fileId: string, mutation: 'deleted' | 'renamed' | 'changed' | null) => void
  setLastKnownDiskSignature: (fileId: string, signature: string) => void
  clearPendingDiskBaselineVerification: (fileId: string) => void
  clearUntitled: (fileId: string) => void
  openDiff: (
    worktreeId: string,
    filePath: string,
    relativePath: string,
    language: string,
    staged: boolean,
    options?: EditorOpenTargetOptions
  ) => void
  openBranchDiff: (
    worktreeId: string,
    worktreePath: string,
    entry: GitBranchChangeEntry,
    compare: BranchCompareLike,
    language: string,
    options?: EditorOpenTargetOptions
  ) => void
  openCommitDiff: (
    worktreeId: string,
    worktreePath: string,
    entry: GitBranchChangeEntry,
    compare: CommitCompareLike,
    language: string,
    options?: EditorOpenTargetOptions
  ) => void
  openAllDiffs: (
    worktreeId: string,
    worktreePath: string,
    alternate?: CombinedDiffAlternate,
    areaFilter?: string,
    entriesSnapshot?: GitStatusEntry[],
    options?: WorkspacePanelEditorOpenOptions
  ) => void
  openConflictFile: (
    worktreeId: string,
    worktreePath: string,
    entry: GitStatusEntry,
    language: string,
    options?: EditorOpenTargetOptions
  ) => void
  openConflictReviewFile: (
    reviewFileId: string,
    worktreeId: string,
    worktreePath: string,
    entry: GitStatusEntry,
    language: string,
    options?: WorkspacePanelEditorOpenOptions
  ) => void
  openConflictReview: (
    worktreeId: string,
    worktreePath: string,
    entries: ConflictReviewEntry[],
    source: ConflictReviewState['source'],
    options?: WorkspacePanelEditorOpenOptions
  ) => void
  openCheckRunDetails: (
    worktreeId: string,
    contextKey: string,
    check: OpenCheckRunDetailsState['check'],
    state: Pick<OpenCheckRunDetailsState, 'details' | 'loading' | 'error'>,
    options?: EditorOpenTargetOptions
  ) => void
  patchOpenCheckRunDetails: (
    worktreeId: string,
    contextKey: string,
    check: OpenCheckRunDetailsState['check'],
    state: Pick<OpenCheckRunDetailsState, 'details' | 'loading' | 'error'>
  ) => void
  reloadOpenCheckRunDetailsTab: (fileId: string) => Promise<void>
  openBranchAllDiffs: (
    worktreeId: string,
    worktreePath: string,
    compare: GitBranchCompareSummary,
    alternate?: CombinedDiffAlternate,
    options?: WorkspacePanelEditorOpenOptions
  ) => void
  openCommitAllDiffs: (
    worktreeId: string,
    worktreePath: string,
    compare: GitCommitCompareSummary,
    entries: GitBranchChangeEntry[],
    subject?: string,
    message?: string,
    options?: WorkspacePanelEditorOpenOptions
  ) => void
}
