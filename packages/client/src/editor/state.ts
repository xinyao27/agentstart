import type { StateCreator } from 'zustand'
import type { AppState } from '~renderer/store/types'

import { createEditorAppearanceActions } from './appearance-actions'
import { createEditorBranchCompareActions } from './branch-compare-actions'
import { createEditorBulkCloseActions } from './bulk-close-actions'
import { createEditorCheckDetailsActions } from './check-details-actions'
import { createEditorCombinedDiffActions } from './combined-diff-actions'
import { createEditorConflictFileActions } from './conflict-file-actions'
import { createEditorConflictReviewActions } from './conflict-review-actions'
import { createEditorDiffCommitActions } from './diff-commit-actions'
import { createEditorDiffFileActions } from './diff-file-actions'
import { createEditorFileCloseActions } from './file-close-actions'
import { createEditorFileMetadataActions } from './file-metadata-actions'
import { createEditorFileOpenActions } from './file-open-actions'
import { createMarkdownLinkActions } from './markdown-link-actions'
import { createEditorMarkdownPreviewActions } from './markdown-preview/actions'
import { createEditorRemotePushActions } from './remote-push-actions'
import { createEditorRemoteSyncActions } from './remote-sync-actions'
import { createEditorSearchActions } from './search-actions'
import { createEditorSessionHydrationActions } from './session-hydration-actions'
import { createEditorStatusActions } from './status-actions'
import type { EditorSlice } from './store-contract'

export type {
  ActiveRightSidebarTab,
  RightSidebarExplorerView,
  RightSidebarTab
} from '@yiru/protocol/settings/ui-state'
export type {
  ActivityBarPosition,
  BranchCompareSnapshot,
  ClosedEditorTabSnapshot,
  CombinedDiffSkippedConflict,
  CommitCompareSnapshot,
  ConflictReviewEntry,
  ConflictReviewState,
  DiffSource,
  EditorViewMode,
  MarkdownViewMode,
  OpenConflictMetadata,
  OpenFile,
  PendingEditorReveal
} from './file-model'
export type { EditorSlice } from './store-contract'

export const createEditorSlice: StateCreator<AppState, [], [], EditorSlice> = (set, get) => ({
  ...createEditorAppearanceActions(set, get),
  ...createEditorBranchCompareActions(set, get),
  ...createEditorBulkCloseActions(set, get),
  ...createEditorCheckDetailsActions(set, get),
  ...createEditorCombinedDiffActions(set, get),
  ...createEditorConflictFileActions(set, get),
  ...createEditorConflictReviewActions(set, get),
  ...createEditorDiffCommitActions(set, get),
  ...createEditorDiffFileActions(set, get),
  ...createEditorFileCloseActions(set, get),
  ...createEditorFileMetadataActions(set, get),
  ...createEditorFileOpenActions(set, get),
  ...createMarkdownLinkActions(set, get),
  ...createEditorMarkdownPreviewActions(set, get),
  ...createEditorSearchActions(set, get),
  ...createEditorSessionHydrationActions(set, get),
  ...createEditorStatusActions(set, get),
  ...createEditorRemotePushActions(set, get),
  ...createEditorRemoteSyncActions(set, get)
})
