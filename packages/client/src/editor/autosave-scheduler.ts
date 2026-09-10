import type { StoreApi } from 'zustand'
import { getConnectionIdForFile } from '~renderer/runtime/connection-context'
import { writeRuntimeFile } from '~renderer/runtime/file-client'
import { settingsForRuntimeOwner } from '~renderer/runtime/rpc-client'
import type { AppState } from '~renderer/store/state'
import { findWorktreeById } from '~renderer/worktree/state/types'

import {
  canAutoSaveOpenFile,
  isAutosaveSuspendedForFile,
  normalizeAutoSaveDelayMs
} from './autosave'
import { AGENTSTART_EDITOR_FILE_SAVED_EVENT } from './autosave'
import type { EditorFileSavedDetail } from './autosave'
import { getDiskBaselineSignature } from './diff-content-signature'
import { trackExternalChangeConflictAction } from './external-change-telemetry'
import { flushPendingEditorChange } from './pending-flush'
import {
  clearSelfWrite,
  getEditorSelfWriteHostId,
  recordSelfWrite,
  SELF_WRITE_REMOTE_TTL_MS
} from './self-write-registry'
import type { OpenFile } from './state'

export type AppStoreApi = Pick<StoreApi<AppState>, 'getState' | 'subscribe'>

export type EditorAutosaveScheduler = {
  queueSave: (
    file: OpenFile,
    fallbackContent: string,
    trigger?: 'autosave' | 'user'
  ) => Promise<void>
  quiesceFileSave: (fileId: string) => Promise<void>
  getLatestWritableContent: (file: OpenFile) => string | null
  cancelFileSave: (fileId: string) => void
  syncAutoSave: () => void
  dispose: () => void
}

export function createEditorAutosaveScheduler(store: AppStoreApi): EditorAutosaveScheduler {
  const timers = new Map<string, number>()
  const scheduledContent = new Map<string, string>()
  const saveQueue = new Map<string, Promise<void>>()
  const saveGeneration = new Map<string, number>()

  const clearTimer = (fileId: string): void => {
    const timerId = timers.get(fileId)
    if (timerId !== undefined) {
      window.clearTimeout(timerId)
      timers.delete(fileId)
    }
    scheduledContent.delete(fileId)
  }

  const bumpGeneration = (fileId: string): void => {
    saveGeneration.set(fileId, (saveGeneration.get(fileId) ?? 0) + 1)
  }

  const queueSave: EditorAutosaveScheduler['queueSave'] = (
    file,
    fallbackContent,
    trigger = 'user'
  ) => {
    clearTimer(file.id)
    const queuedGeneration = saveGeneration.get(file.id) ?? 0
    const previousSave = saveQueue.get(file.id) ?? Promise.resolve()
    const queuedSave = previousSave
      .catch(() => undefined)
      .then(async () => {
        if ((saveGeneration.get(file.id) ?? 0) !== queuedGeneration) {
          return
        }
        const state = store.getState()
        const liveFile = state.openFiles.find((openFile) => openFile.id === file.id) ?? null
        if (
          !liveFile ||
          liveFile.readOnly === true ||
          (trigger === 'autosave' && isAutosaveSuspendedForFile(liveFile))
        ) {
          return
        }

        const contentToSave = state.editorDrafts[file.id] ?? fallbackContent
        const connectionId =
          getConnectionIdForFile(liveFile.worktreeId, liveFile.filePath) ?? undefined
        const worktree = liveFile.worktreeId
          ? findWorktreeById(state.worktreesByRepo ?? {}, liveFile.worktreeId)
          : null
        const selfWriteHostId = getEditorSelfWriteHostId(
          liveFile.runtimeEnvironmentId,
          connectionId
        )
        recordSelfWrite(
          liveFile.filePath,
          contentToSave,
          selfWriteHostId,
          connectionId || liveFile.runtimeEnvironmentId?.trim()
            ? SELF_WRITE_REMOTE_TTL_MS
            : undefined
        )
        try {
          await writeRuntimeFile(
            {
              settings: settingsForRuntimeOwner(state.settings, liveFile.runtimeEnvironmentId),
              worktreeId: liveFile.worktreeId,
              worktreePath: worktree?.path ?? null,
              connectionId
            },
            liveFile.filePath,
            contentToSave
          )
        } catch (error) {
          clearSelfWrite(liveFile.filePath, selfWriteHostId)
          throw error
        }

        if ((saveGeneration.get(file.id) ?? 0) !== queuedGeneration) {
          return
        }
        const nextState = store.getState()
        const currentDraft = nextState.editorDrafts[file.id]
        const stillDirty = currentDraft !== undefined && currentDraft !== contentToSave
        nextState.markFileDirty(file.id, stillDirty)
        if (!stillDirty) {
          nextState.clearEditorDraft(file.id)
        }
        nextState.setLastKnownDiskSignature(file.id, getDiskBaselineSignature(contentToSave))
        nextState.clearPendingDiskBaselineVerification(file.id)
        const savedFile = nextState.openFiles.find((openFile) => openFile.id === file.id)
        if (savedFile?.externalMutation === 'changed') {
          trackExternalChangeConflictAction(savedFile, 'save_overwrite')
          nextState.setExternalMutation(file.id, null)
        }
        window.dispatchEvent(
          new CustomEvent<EditorFileSavedDetail>(AGENTSTART_EDITOR_FILE_SAVED_EVENT, {
            detail: { fileId: file.id, content: contentToSave }
          })
        )
      })

    let trackedSave: Promise<void>
    trackedSave = queuedSave.finally(() => {
      if (saveQueue.get(file.id) === trackedSave) {
        saveQueue.delete(file.id)
      }
    })
    saveQueue.set(file.id, trackedSave)
    return trackedSave
  }

  const quiesceFileSave = async (fileId: string): Promise<void> => {
    flushPendingEditorChange(fileId)
    const pendingSave = saveQueue.get(fileId)
    clearTimer(fileId)
    bumpGeneration(fileId)
    await pendingSave?.catch(() => undefined)
  }

  const getLatestWritableContent = (file: OpenFile): string | null =>
    store.getState().editorDrafts[file.id] ?? null

  const cancelFileSave = (fileId: string): void => {
    clearTimer(fileId)
    bumpGeneration(fileId)
  }

  const syncAutoSave = (): void => {
    const state = store.getState()
    const openFilesById = new Map(state.openFiles.map((file) => [file.id, file]))
    for (const fileId of timers.keys()) {
      const file = openFilesById.get(fileId)
      const draft = state.editorDrafts[fileId]
      if (
        !state.settings?.editorAutoSave ||
        !file?.isDirty ||
        !canAutoSaveOpenFile(file) ||
        isAutosaveSuspendedForFile(file) ||
        draft === undefined
      ) {
        clearTimer(fileId)
      }
    }
    if (!state.settings?.editorAutoSave) {
      return
    }

    const delayMs = normalizeAutoSaveDelayMs(state.settings.editorAutoSaveDelayMs)
    for (const file of state.openFiles) {
      const draft = state.editorDrafts[file.id]
      if (
        !file.isDirty ||
        draft === undefined ||
        !canAutoSaveOpenFile(file) ||
        isAutosaveSuspendedForFile(file)
      ) {
        clearTimer(file.id)
        continue
      }
      if (timers.has(file.id) && scheduledContent.get(file.id) === draft) {
        continue
      }
      clearTimer(file.id)
      scheduledContent.set(file.id, draft)
      const timerId = window.setTimeout(() => {
        timers.delete(file.id)
        scheduledContent.delete(file.id)
        void queueSave(file, draft, 'autosave')
      }, delayMs)
      timers.set(file.id, timerId)
    }
  }

  const dispose = (): void => {
    for (const timerId of timers.values()) {
      window.clearTimeout(timerId)
    }
    timers.clear()
    scheduledContent.clear()
    saveQueue.clear()
    saveGeneration.clear()
  }

  return {
    queueSave,
    quiesceFileSave,
    getLatestWritableContent,
    cancelFileSave,
    syncAutoSave,
    dispose
  }
}
