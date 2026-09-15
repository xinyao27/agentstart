import type { StateCreator } from 'zustand'
import { joinPath } from '~renderer/path'
import type { AppState } from '~renderer/store/types'

import { toBranchCompareSnapshot, toCommitCompareSnapshot } from './compare-snapshots'
import { resolveDiffRuntimeEnvironmentId } from './diff-runtime-owner'
import { withDiffContentReloadRequest } from './file-identity'
import type { OpenFile } from './file-model'
import type { EditorFileSlice } from './file-store'
import {
  getReplaceablePreviewFileId,
  removeEditorStateForReplacedPreview
} from './preview-replacement'
import type { EditorSlice } from './store-contract'
import { openWorkspaceEditorItem, resolveEditorOpenTargetGroupId } from './workspace-editor-target'

type EditorDiffCommitActions = Pick<EditorFileSlice, 'openCommitDiff' | 'openAllDiffs'>

export function createEditorDiffCommitActions(
  set: Parameters<StateCreator<AppState, [], [], EditorSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], EditorSlice>>[1]
): EditorDiffCommitActions {
  return {
    openCommitDiff: (worktreeId, worktreePath, entry, compare, language, options) => {
      const commitCompare = toCommitCompareSnapshot(compare)
      const id = `${worktreeId}::diff::commit::${commitCompare.compareVersion}::${entry.path}`
      const isPreview = options?.preview ?? false
      let editorItemTargetGroupId = options?.targetGroupId
      set((s) => {
        const targetGroupId =
          resolveEditorOpenTargetGroupId(s, worktreeId, options?.targetGroupId) ?? undefined
        editorItemTargetGroupId = targetGroupId
        const runtimeEnvironmentId = resolveDiffRuntimeEnvironmentId(
          s,
          worktreeId,
          options?.runtimeEnvironmentId
        )
        const existing = s.openFiles.find((f) => f.id === id)
        if (existing) {
          const updatedPreview = isPreview ? existing.isPreview : false
          const reopenedDiff = withDiffContentReloadRequest({
            ...existing,
            mode: 'diff' as const,
            diffSource: 'commit' as const,
            commitCompare,
            branchOldPath: entry.oldPath,
            conflict: undefined,
            skippedConflicts: undefined,
            conflictReview: undefined,
            isPreview: updatedPreview,
            runtimeEnvironmentId
          })
          return {
            openFiles: s.openFiles.map((f) => (f.id === id ? reopenedDiff : f)),
            activeFileId: id,
            activeTabType: 'editor',
            activeFileIdByWorktree: { ...s.activeFileIdByWorktree, [worktreeId]: id },
            activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' }
          }
        }
        const newFile: OpenFile = {
          id,
          filePath: joinPath(worktreePath, entry.path),
          relativePath: entry.path,
          worktreeId,
          language,
          isDirty: false,
          mode: 'diff',
          diffSource: 'commit',
          commitCompare,
          branchOldPath: entry.oldPath,
          conflict: undefined,
          skippedConflicts: undefined,
          conflictReview: undefined,
          isPreview: isPreview || undefined,
          runtimeEnvironmentId
        }
        if (isPreview) {
          const replaceablePreviewId = getReplaceablePreviewFileId(s, worktreeId, targetGroupId)
          const replaceablePreviewIndex = s.openFiles.findIndex(
            (file) => file.id === replaceablePreviewId
          )
          if (replaceablePreviewIndex !== -1) {
            return {
              openFiles: s.openFiles.map((file, index) =>
                index === replaceablePreviewIndex ? newFile : file
              ),
              ...removeEditorStateForReplacedPreview(s, s.openFiles[replaceablePreviewIndex], id),
              activeFileId: id,
              activeTabType: 'editor',
              activeFileIdByWorktree: { ...s.activeFileIdByWorktree, [worktreeId]: id },
              activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' }
            }
          }
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
        entry.path,
        'diff',
        isPreview,
        editorItemTargetGroupId
      )
    },

    openAllDiffs: (worktreeId, worktreePath, alternate, areaFilter, entriesSnapshot) => {
      const id = areaFilter
        ? `${worktreeId}::all-diffs::uncommitted::${areaFilter}`
        : `${worktreeId}::all-diffs::uncommitted`
      const label = areaFilter
        ? ({ staged: 'Staged Changes', unstaged: 'Changes', untracked: 'Untracked Files' }[
            areaFilter
          ] ?? 'All Changes')
        : 'All Changes'
      set((s) => {
        const branchSummary = s.gitBranchCompareSummaryByWorktree[worktreeId]
        const branchCompare =
          !areaFilter &&
          branchSummary?.status === 'ready' &&
          branchSummary.baseOid &&
          branchSummary.headOid &&
          branchSummary.mergeBase
            ? toBranchCompareSnapshot(branchSummary)
            : undefined
        const branchEntriesSnapshot = branchCompare
          ? (s.gitBranchChangesByWorktree[worktreeId] ?? [])
          : undefined
        const relevantEntries =
          entriesSnapshot ??
          (s.gitStatusByWorktree[worktreeId] ?? []).filter((entry) => {
            return areaFilter === undefined || entry.area === areaFilter
          })
        const skippedConflicts = relevantEntries
          .filter((entry) => entry.conflictStatus === 'unresolved' && entry.conflictKind)
          .map((entry) => ({ path: entry.path, conflictKind: entry.conflictKind! }))
        // Why: snapshot the entry list at open time so a subsequent commit does
        // not yank entries from under the combined diff view, which would rebuild
        // all sections and lose loaded content + scroll position.
        const uncommittedEntriesSnapshot = relevantEntries
        const id = areaFilter
          ? `${worktreeId}::all-diffs::uncommitted::${areaFilter}`
          : `${worktreeId}::all-diffs::uncommitted`
        const label = areaFilter
          ? ({ staged: 'Staged Changes', unstaged: 'Changes', untracked: 'Untracked Files' }[
              areaFilter
            ] ?? 'All Changes')
          : 'All Changes'
        const runtimeEnvironmentId = resolveDiffRuntimeEnvironmentId(s, worktreeId, undefined)
        const existing = s.openFiles.find((f) => f.id === id)
        if (existing) {
          return {
            openFiles: s.openFiles.map((f) =>
              f.id === id
                ? {
                    ...f,
                    diffSource: branchCompare ? 'combined-all' : 'combined-uncommitted',
                    branchCompare,
                    branchEntriesSnapshot,
                    uncommittedEntriesSnapshot,
                    combinedAlternate: alternate,
                    combinedAreaFilter: areaFilter,
                    skippedConflicts,
                    conflictReview: undefined,
                    conflict: undefined,
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
          diffSource: branchCompare ? 'combined-all' : 'combined-uncommitted',
          branchCompare,
          branchEntriesSnapshot,
          uncommittedEntriesSnapshot,
          combinedAlternate: alternate,
          combinedAreaFilter: areaFilter,
          skippedConflicts,
          conflictReview: undefined,
          conflict: undefined,
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
  }
}
