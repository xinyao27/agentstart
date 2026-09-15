import type { StateCreator } from 'zustand'
import type { AppState } from '~renderer/store/types'

import type { ConflictReviewState, OpenFile } from './file-model'
import type { EditorFileSlice } from './file-store'
import type { EditorSlice } from './store-contract'
import { openWorkspaceEditorItem } from './workspace-editor-target'

type EditorConflictReviewActions = Pick<EditorFileSlice, 'openConflictReview'>

export function createEditorConflictReviewActions(
  set: Parameters<StateCreator<AppState, [], [], EditorSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], EditorSlice>>[1]
): EditorConflictReviewActions {
  return {
    openConflictReview: (worktreeId, worktreePath, entries, source) => {
      const id = `${worktreeId}::conflict-review`
      set((s) => {
        const conflictReview: ConflictReviewState = {
          source,
          snapshotTimestamp: Date.now(),
          entries
        }
        const existing = s.openFiles.find((f) => f.id === id)

        if (existing) {
          return {
            openFiles: s.openFiles.map((f) =>
              f.id === id
                ? {
                    ...f,
                    mode: 'conflict-review' as const,
                    relativePath: 'Conflict Review',
                    filePath: worktreePath,
                    language: 'plaintext',
                    conflictReview,
                    conflict: undefined,
                    skippedConflicts: undefined
                  }
                : f
            ),
            activeFileId: id,
            activeTabType: 'editor',
            activeFileIdByWorktree: { ...s.activeFileIdByWorktree, [worktreeId]: id },
            activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' }
          }
        }

        const newFile: OpenFile = {
          id,
          filePath: worktreePath,
          relativePath: 'Conflict Review',
          worktreeId,
          language: 'plaintext',
          isDirty: false,
          mode: 'conflict-review',
          conflictReview
        }

        return {
          openFiles: [...s.openFiles, newFile],
          activeFileId: id,
          activeTabType: 'editor',
          activeFileIdByWorktree: { ...s.activeFileIdByWorktree, [worktreeId]: id },
          activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' }
        }
      })
      void openWorkspaceEditorItem(get(), id, worktreeId, 'Conflict Review', 'conflict-review')
    }

    // Why: the checks panel only has room for inline summaries; full logs and
    // annotations open as their own tab.
  }
}
