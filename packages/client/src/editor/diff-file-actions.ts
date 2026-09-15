import type { StateCreator } from 'zustand'
import { joinPath } from '~renderer/path'
import type { AppState } from '~renderer/store/types'

import { toBranchCompareSnapshot } from './compare-snapshots'
import { resolveDiffRuntimeEnvironmentId } from './diff-runtime-owner'
import { buildDiffEditorFileId, withDiffContentReloadRequest } from './file-identity'
import type { DiffSource, OpenFile } from './file-model'
import type { EditorFileSlice } from './file-store'
import {
  getReplaceablePreviewFileId,
  removeEditorStateForReplacedPreview
} from './preview-replacement'
import type { EditorSlice } from './store-contract'
import { openWorkspaceEditorItem, resolveEditorOpenTargetGroupId } from './workspace-editor-target'

type EditorDiffFileActions = Pick<EditorFileSlice, 'openDiff' | 'openBranchDiff'>

export function createEditorDiffFileActions(
  set: Parameters<StateCreator<AppState, [], [], EditorSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], EditorSlice>>[1]
): EditorDiffFileActions {
  return {
    openDiff: (worktreeId, filePath, relativePath, language, staged, options) => {
      const isPreview = options?.preview ?? false
      let editorItemTargetGroupId = options?.targetGroupId
      let editorItemFileId = ''
      set((s) => {
        const runtimeEnvironmentId = resolveDiffRuntimeEnvironmentId(
          s,
          worktreeId,
          options?.runtimeEnvironmentId
        )
        const diffSource: DiffSource = staged ? 'staged' : 'unstaged'
        const id = buildDiffEditorFileId(worktreeId, diffSource, relativePath, runtimeEnvironmentId)
        editorItemFileId = id
        const targetGroupId =
          resolveEditorOpenTargetGroupId(s, worktreeId, options?.targetGroupId) ?? undefined
        editorItemTargetGroupId = targetGroupId
        const existing = s.openFiles.find((f) => f.id === id)
        if (existing) {
          const updatedPreview = isPreview ? existing.isPreview : false
          const reopenedDiff = withDiffContentReloadRequest({
            ...existing,
            mode: 'diff' as const,
            diffSource,
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
          filePath,
          relativePath,
          worktreeId,
          language,
          isDirty: false,
          mode: 'diff',
          diffSource,
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
        editorItemFileId,
        worktreeId,
        relativePath,
        'diff',
        isPreview,
        editorItemTargetGroupId
      )
    },

    openBranchDiff: (worktreeId, worktreePath, entry, compare, language, options) => {
      const branchCompare = toBranchCompareSnapshot(compare)
      const id = `${worktreeId}::diff::branch::${compare.baseRef}::${branchCompare.compareVersion}::${entry.path}`
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
            diffSource: 'branch' as const,
            branchCompare,
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
          diffSource: 'branch',
          branchCompare,
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
    }
  }
}
