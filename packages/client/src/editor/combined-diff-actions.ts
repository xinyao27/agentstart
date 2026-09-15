import type { StateCreator } from 'zustand'
import type { AppState } from '~renderer/store/types'

import { toBranchCompareSnapshot, toCommitCompareSnapshot } from './compare-snapshots'
import { resolveDiffRuntimeEnvironmentId } from './diff-runtime-owner'
import type { OpenFile } from './file-model'
import type { EditorFileSlice } from './file-store'
import type { EditorSlice } from './store-contract'
import { openWorkspaceEditorItem } from './workspace-editor-target'

type EditorCombinedDiffActions = Pick<EditorFileSlice, 'openBranchAllDiffs' | 'openCommitAllDiffs'>

export function createEditorCombinedDiffActions(
  set: Parameters<StateCreator<AppState, [], [], EditorSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], EditorSlice>>[1]
): EditorCombinedDiffActions {
  return {
    openBranchAllDiffs: (worktreeId, worktreePath, compare, alternate) => {
      const branchCompare = toBranchCompareSnapshot(compare)
      const id = `${worktreeId}::all-diffs::branch::${compare.baseRef}::${branchCompare.compareVersion}`
      set((s) => {
        const runtimeEnvironmentId = resolveDiffRuntimeEnvironmentId(s, worktreeId, undefined)
        const branchEntriesSnapshot = s.gitBranchChangesByWorktree[worktreeId] ?? []
        const existing = s.openFiles.find((f) => f.id === id)
        if (existing) {
          return {
            openFiles: s.openFiles.map((f) =>
              f.id === id
                ? {
                    ...f,
                    branchCompare,
                    branchEntriesSnapshot,
                    combinedAlternate: alternate,
                    conflict: undefined,
                    skippedConflicts: undefined,
                    conflictReview: undefined,
                    runtimeEnvironmentId
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
          relativePath: `Branch Changes (${compare.baseRef})`,
          worktreeId,
          language: 'plaintext',
          isDirty: false,
          mode: 'diff',
          diffSource: 'combined-branch',
          branchCompare,
          branchEntriesSnapshot,
          combinedAlternate: alternate,
          conflict: undefined,
          skippedConflicts: undefined,
          conflictReview: undefined,
          runtimeEnvironmentId
        }
        return {
          openFiles: [...s.openFiles, newFile],
          activeFileId: id,
          activeTabType: 'editor',
          activeFileIdByWorktree: { ...s.activeFileIdByWorktree, [worktreeId]: id },
          activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' }
        }
      })
      void openWorkspaceEditorItem(
        get(),
        id,
        worktreeId,
        `Branch Changes (${compare.baseRef})`,
        'diff'
      )
    },

    openCommitAllDiffs: (worktreeId, worktreePath, compare, entries, subject, message) => {
      const commitCompare = toCommitCompareSnapshot(compare, subject, message)
      const id = `${worktreeId}::all-diffs::commit::${commitCompare.commitOid}`
      const label = subject
        ? `Commit ${commitCompare.compareRef}: ${subject}`
        : `Commit ${commitCompare.compareRef}`
      set((s) => {
        const runtimeEnvironmentId = resolveDiffRuntimeEnvironmentId(s, worktreeId, undefined)
        const existing = s.openFiles.find((f) => f.id === id)
        if (existing) {
          return {
            openFiles: s.openFiles.map((f) =>
              f.id === id
                ? {
                    ...f,
                    relativePath: label,
                    commitCompare,
                    commitEntriesSnapshot: entries,
                    conflict: undefined,
                    skippedConflicts: undefined,
                    conflictReview: undefined,
                    runtimeEnvironmentId
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
          relativePath: label,
          worktreeId,
          language: 'plaintext',
          isDirty: false,
          mode: 'diff',
          diffSource: 'combined-commit',
          commitCompare,
          commitEntriesSnapshot: entries,
          conflict: undefined,
          skippedConflicts: undefined,
          conflictReview: undefined,
          runtimeEnvironmentId
        }
        return {
          openFiles: [...s.openFiles, newFile],
          activeFileId: id,
          activeTabType: 'editor',
          activeFileIdByWorktree: { ...s.activeFileIdByWorktree, [worktreeId]: id },
          activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' }
        }
      })
      void openWorkspaceEditorItem(get(), id, worktreeId, label, 'diff')
    }

    // Cursor line tracking
  }
}
