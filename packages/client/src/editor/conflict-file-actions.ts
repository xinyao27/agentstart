import type { StateCreator } from 'zustand'
import { joinPath } from '~renderer/path'
import type { AppState } from '~renderer/store/types'

import { toOpenConflictMetadata } from './conflict-metadata'
import type { OpenFile } from './file-model'
import type { EditorFileSlice } from './file-store'
import {
  getReplaceablePreviewFileId,
  removeEditorStateForReplacedPreview
} from './preview-replacement'
import type { EditorSlice } from './store-contract'
import { openWorkspaceEditorItem, resolveEditorOpenTargetGroupId } from './workspace-editor-target'

type EditorConflictFileActions = Pick<
  EditorFileSlice,
  'openConflictFile' | 'openConflictReviewFile'
>

export function createEditorConflictFileActions(
  set: Parameters<StateCreator<AppState, [], [], EditorSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], EditorSlice>>[1]
): EditorConflictFileActions {
  return {
    openConflictFile: (worktreeId, worktreePath, entry, language, options) => {
      const absolutePath = joinPath(worktreePath, entry.path)
      const isPreview = options?.preview ?? false
      let editorItemTargetGroupId = options?.targetGroupId
      set((s) => {
        const id = absolutePath
        const conflict = toOpenConflictMetadata(entry)
        const targetGroupId =
          resolveEditorOpenTargetGroupId(s, worktreeId, options?.targetGroupId) ?? undefined
        editorItemTargetGroupId = targetGroupId
        const existing = s.openFiles.find((f) => f.id === id)
        const nextTracked =
          entry.conflictStatus === 'unresolved' && entry.conflictKind
            ? {
                ...s.trackedConflictPathsByWorktree[worktreeId],
                [entry.path]: entry.conflictKind
              }
            : s.trackedConflictPathsByWorktree[worktreeId]

        if (!conflict) {
          return s
        }

        if (existing) {
          const updatedPreview = isPreview ? existing.isPreview : false
          return {
            openFiles: s.openFiles.map((f) =>
              f.id === id
                ? {
                    ...f,
                    mode: 'edit' as const,
                    language,
                    relativePath: entry.path,
                    filePath: absolutePath,
                    conflict,
                    diffSource: undefined,
                    skippedConflicts: undefined,
                    conflictReview: undefined,
                    isPreview: updatedPreview
                  }
                : f
            ),
            activeFileId: id,
            activeTabType: 'editor',
            activeFileIdByWorktree: { ...s.activeFileIdByWorktree, [worktreeId]: id },
            activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' },
            trackedConflictPathsByWorktree:
              nextTracked === s.trackedConflictPathsByWorktree[worktreeId]
                ? s.trackedConflictPathsByWorktree
                : { ...s.trackedConflictPathsByWorktree, [worktreeId]: nextTracked }
          }
        }

        const newFile: OpenFile = {
          id,
          filePath: absolutePath,
          relativePath: entry.path,
          worktreeId,
          language,
          isDirty: false,
          mode: 'edit',
          conflict,
          isPreview: isPreview || undefined
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
              activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' },
              trackedConflictPathsByWorktree:
                nextTracked === s.trackedConflictPathsByWorktree[worktreeId]
                  ? s.trackedConflictPathsByWorktree
                  : { ...s.trackedConflictPathsByWorktree, [worktreeId]: nextTracked }
            }
          }
        }

        return {
          openFiles: [...s.openFiles, newFile],
          activeFileId: id,
          activeTabType: 'editor',
          activeFileIdByWorktree: { ...s.activeFileIdByWorktree, [worktreeId]: id },
          activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' },
          trackedConflictPathsByWorktree:
            nextTracked === s.trackedConflictPathsByWorktree[worktreeId]
              ? s.trackedConflictPathsByWorktree
              : { ...s.trackedConflictPathsByWorktree, [worktreeId]: nextTracked }
        }
      })
      void openWorkspaceEditorItem(
        get(),
        absolutePath,
        worktreeId,
        entry.path,
        'editor',
        isPreview,
        editorItemTargetGroupId
      )
    },

    openConflictReviewFile: (reviewFileId, worktreeId, worktreePath, entry, language) => {
      const absolutePath = joinPath(worktreePath, entry.path)
      const reviewTab = (get().unifiedTabsByWorktree?.[worktreeId] ?? []).find(
        (tab) => tab.entityId === reviewFileId && tab.contentType === 'conflict-review'
      )
      set((s) => {
        const conflict = toOpenConflictMetadata(entry)
        const existing = s.openFiles.find((f) => f.id === absolutePath)
        const nextTracked =
          entry.conflictStatus === 'unresolved' && entry.conflictKind
            ? {
                ...s.trackedConflictPathsByWorktree[worktreeId],
                [entry.path]: entry.conflictKind
              }
            : s.trackedConflictPathsByWorktree[worktreeId]

        if (!conflict) {
          return s
        }

        const nextOpenFiles = existing
          ? s.openFiles.map((f) =>
              f.id === absolutePath
                ? {
                    ...f,
                    mode: 'edit' as const,
                    language,
                    relativePath: entry.path,
                    filePath: absolutePath,
                    conflict,
                    diffSource: undefined,
                    skippedConflicts: undefined,
                    conflictReview: undefined
                  }
                : f.id === reviewFileId && f.conflictReview
                  ? {
                      ...f,
                      conflictReview: {
                        ...f.conflictReview,
                        selectedFileId: absolutePath
                      }
                    }
                  : f
            )
          : [
              ...s.openFiles.map((f) =>
                f.id === reviewFileId && f.conflictReview
                  ? {
                      ...f,
                      conflictReview: {
                        ...f.conflictReview,
                        selectedFileId: absolutePath
                      }
                    }
                  : f
              ),
              {
                id: absolutePath,
                filePath: absolutePath,
                relativePath: entry.path,
                worktreeId,
                language,
                isDirty: false,
                mode: 'edit' as const,
                conflict
              }
            ]

        return {
          openFiles: nextOpenFiles,
          activeFileId: reviewFileId,
          activeTabType: 'editor',
          activeFileIdByWorktree: { ...s.activeFileIdByWorktree, [worktreeId]: reviewFileId },
          activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' },
          trackedConflictPathsByWorktree:
            nextTracked === s.trackedConflictPathsByWorktree[worktreeId]
              ? s.trackedConflictPathsByWorktree
              : { ...s.trackedConflictPathsByWorktree, [worktreeId]: nextTracked }
        }
      })

      // Why: the conflict review tab renders and saves its own selected OpenFile,
      // so the file still needs a backing editor tab for save/close flows while
      // keeping the review tab visible.
      void openWorkspaceEditorItem(
        get(),
        absolutePath,
        worktreeId,
        entry.path,
        'editor',
        undefined,
        reviewTab?.groupId
      )
      if (reviewTab) {
        get().activateTab?.(reviewTab.id)
      }
    }

    // Why: Review conflicts is launched from Source Control into the editor area,
    // not from Checks. Merge-conflict review is source-control work, not CI/PR
    // status. The tab renders from a stored snapshot (entries + timestamp), not
    // from live status on every paint, so the list is stable even if the live
    // unresolved set changes between polls.
  }
}
