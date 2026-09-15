import type { StateCreator } from 'zustand'
import { translate } from '~renderer/i18n/i18n'
import type { AppState } from '~renderer/store/types'
import { findWorktreeById, getRepoIdFromWorktreeId } from '~renderer/worktree/state/types'

import {
  buildCheckRunDetailsTabId,
  getCheckRunDetailsTabLabel,
  type OpenCheckRunDetailsState
} from './check-run-details-tab'
import type { OpenFile } from './file-model'
import type { EditorFileSlice } from './file-store'
import {
  getReplaceablePreviewFileId,
  removeEditorStateForReplacedPreview
} from './preview-replacement'
import type { EditorSlice } from './store-contract'
import { openWorkspaceEditorItem } from './workspace-editor-target'

type EditorCheckDetailsActions = Pick<
  EditorFileSlice,
  'openCheckRunDetails' | 'patchOpenCheckRunDetails' | 'reloadOpenCheckRunDetailsTab'
>

export function createEditorCheckDetailsActions(
  set: Parameters<StateCreator<AppState, [], [], EditorSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], EditorSlice>>[1]
): EditorCheckDetailsActions {
  return {
    openCheckRunDetails: (worktreeId, contextKey, check, state, options) => {
      const id = buildCheckRunDetailsTabId(worktreeId, check)
      const label = getCheckRunDetailsTabLabel(check)
      const isPreview = options?.preview ?? false
      const checkRunDetails: OpenCheckRunDetailsState = {
        contextKey,
        check,
        details: state.details,
        loading: state.loading,
        error: state.error
      }
      set((s) => {
        const existing = s.openFiles.find((f) => f.id === id)
        if (existing) {
          const updatedPreview = isPreview ? existing.isPreview : false
          return {
            openFiles: s.openFiles.map((f) =>
              f.id === id
                ? {
                    ...f,
                    mode: 'check-details' as const,
                    relativePath: label,
                    language: 'plaintext',
                    isPreview: updatedPreview,
                    checkRunDetails
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
          filePath: id,
          relativePath: label,
          worktreeId,
          language: 'plaintext',
          isDirty: false,
          isPreview: isPreview || undefined,
          mode: 'check-details',
          checkRunDetails
        }

        if (isPreview) {
          const replaceablePreviewId = getReplaceablePreviewFileId(
            s,
            worktreeId,
            options?.targetGroupId
          )
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
        label,
        'check-details',
        isPreview,
        options?.targetGroupId
      )
    },

    // Why: sidebar detail fetches can finish after a full-details view is already
    // open; this updates the tab snapshot without stealing focus from the user.
    patchOpenCheckRunDetails: (worktreeId, contextKey, check, state) => {
      const id = buildCheckRunDetailsTabId(worktreeId, check)
      const nextCheckRunDetails: OpenCheckRunDetailsState = {
        contextKey,
        check,
        details: state.details,
        loading: state.loading,
        error: state.error
      }
      set((s) => {
        const existing = s.openFiles.find((f) => f.id === id)
        if (!existing?.checkRunDetails) {
          return s
        }
        const current = existing.checkRunDetails
        if (
          current.contextKey === nextCheckRunDetails.contextKey &&
          current.check.status === nextCheckRunDetails.check.status &&
          current.check.conclusion === nextCheckRunDetails.check.conclusion &&
          current.loading === nextCheckRunDetails.loading &&
          current.error === nextCheckRunDetails.error &&
          current.details === nextCheckRunDetails.details
        ) {
          return s
        }
        return {
          openFiles: s.openFiles.map((f) =>
            f.id === id ? { ...f, checkRunDetails: nextCheckRunDetails } : f
          )
        }
      })
    },

    reloadOpenCheckRunDetailsTab: async (fileId) => {
      const state = get()
      const file = state.openFiles.find((candidate) => candidate.id === fileId)
      const checkRunDetails = file?.checkRunDetails
      if (!file || file.mode !== 'check-details' || !checkRunDetails) {
        return
      }
      const worktree = findWorktreeById(state.worktreesByRepo, file.worktreeId)
      const repoId = worktree?.repoId ?? getRepoIdFromWorktreeId(file.worktreeId)
      const repo = state.repos.find((candidate) => candidate.id === repoId)
      if (!repo?.path) {
        return
      }
      const { contextKey, check } = checkRunDetails
      const patch = (
        next: Pick<OpenCheckRunDetailsState, 'details' | 'loading' | 'error'>
      ): void => {
        get().patchOpenCheckRunDetails(file.worktreeId, contextKey, check, next)
      }
      patch({ details: checkRunDetails.details, loading: true, error: null })
      try {
        const details = await get().fetchPRCheckDetails(
          repo.path,
          {
            checkRunId: check.checkRunId,
            workflowRunId: check.workflowRunId,
            checkName: check.name,
            url: check.url,
            prRepo: null
          },
          { repoId: repo.id }
        )
        patch({
          details,
          loading: false,
          error: details
            ? null
            : translate(
                'auto.store.slices.editor.checkRunDetailsUnavailable',
                'No details are available for this check.'
              )
        })
      } catch (error) {
        patch({
          details: null,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : translate(
                  'auto.store.slices.editor.checkRunDetailsLoadFailed',
                  'Failed to load check details.'
                )
        })
      }
    }
  }
}
