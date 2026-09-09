import type { GitBranchChangeEntry } from '@yiru/protocol/git/branch-compare-types'
import type { GitStatusEntry } from '@yiru/protocol/git/status-types'

import type { SourceControlSectionArea } from './section-order'

export const EMPTY_GIT_STATUS_ENTRIES: GitStatusEntry[] = []
export const EMPTY_BRANCH_CHANGE_ENTRIES: GitBranchChangeEntry[] = []

export const SECTION_LABELS: Record<SourceControlSectionArea, { key: string; fallback: string }> = {
  staged: {
    key: 'auto.components.right.sidebar.SourceControl.48a003c1b1',
    fallback: 'Staged Changes'
  },
  unstaged: {
    key: 'auto.components.right.sidebar.SourceControl.d4ef4bafc5',
    fallback: 'Changes'
  },
  untracked: {
    key: 'auto.components.right.sidebar.SourceControl.522f44dce5',
    fallback: 'Untracked Files'
  }
}

export const CONFLICTS_SECTION_LABEL = {
  key: 'auto.components.right.sidebar.SourceControl.conflictsSection',
  fallback: 'Conflicts'
}

// Why: explicit mutation paths refresh immediately; polling can stay conservative.
export const BRANCH_REFRESH_INTERVAL_MS = 30_000

// Why: every stacked block in the panel — tab strip, toolbar, commit area,
// status banners, tree rows — must share one horizontal gutter, and the tree
// rows cannot move because they mirror Pierre's 8px row inline padding.
export const SOURCE_CONTROL_PANEL_GUTTER_CLASS_NAME = 'px-2'

export const SOURCE_CONTROL_TREE_INDENT_PX = 12
export const SOURCE_CONTROL_TREE_DIRECTORY_PADDING_PX = 8
export const SOURCE_CONTROL_TREE_FILE_PADDING_PX = 20
export const SUBMODULE_WORKTREE_ONLY_LABEL = 'Stage inside submodule'
export const SUBMODULE_WORKTREE_ONLY_TOOLTIP =
  'The parent repo (including Stage All) cannot stage file changes inside a submodule'
export const SUBMODULE_LOADING_LABEL = 'Loading submodule changes…'
export const SUBMODULE_EMPTY_LABEL = 'No changes in submodule'
export const SUBMODULE_ERROR_LABEL = 'Failed to load submodule changes'

export function createDefaultCollapsedSections(): Set<string> {
  return new Set()
}
