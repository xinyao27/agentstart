import type { RefObject } from 'react'
import { useEffect } from 'react'
import type { OpenFile } from '~renderer/editor/state'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useAppStore } from '~renderer/store/state'

import {
  type EditorCmdSaveRequestDetail,
  AGENTSTART_EDITOR_REQUEST_CMD_SAVE_EVENT
} from './autosave'
import type { FileContent } from './panel-content-types'
import { flushPendingEditorChange } from './pending-flush'
import { editorShortcutMatches } from './shortcuts'

type UseEditorCmdSaveRequestParams = {
  activeFile: OpenFile | null
  activeViewStateId: string | null | undefined
  openFiles: OpenFile[]
  fileContents: Record<string, FileContent>
  handleSaveForFile: (file: OpenFile, content: string) => Promise<void>
  panelRef: RefObject<HTMLDivElement | null>
}

export function useEditorCmdSaveRequest({
  activeFile,
  activeViewStateId,
  openFiles,
  fileContents,
  handleSaveForFile,
  panelRef
}: UseEditorCmdSaveRequestParams): void {
  const save = useEventCallback((requestedFileId: string): void => {
    if (!activeFile) {
      return
    }
    const requestedFile =
      openFiles.find((openFile) => openFile.id === requestedFileId) ?? activeFile
    const saveTargetFile =
      requestedFile.mode === 'markdown-preview'
        ? (openFiles.find(
            (openFile) =>
              openFile.id === requestedFile.markdownPreviewSourceFileId && openFile.mode === 'edit'
          ) ?? null)
        : requestedFile
    if (!saveTargetFile) {
      return
    }
    // Why: rich markdown, editable diffs, and notebook editors debounce or
    // locally mirror drafts; save must publish their latest input first.
    flushPendingEditorChange(saveTargetFile.id)
    const state = useAppStore.getState()
    const draft = state.editorDrafts[saveTargetFile.id]
    if (!draft && !saveTargetFile.isUntitled && !saveTargetFile.isDirty) {
      return
    }
    const fallbackContent =
      draft ??
      (requestedFile.mode === 'markdown-preview'
        ? fileContents[requestedFile.id]?.content
        : fileContents[saveTargetFile.id]?.content)
    void handleSaveForFile(requestedFile, fallbackContent ?? '')
  })

  useEffect(() => {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<EditorCmdSaveRequestDetail>).detail
      if (
        !activeFile ||
        !detail ||
        detail.panelFileId !== activeFile.id ||
        (detail.viewStateId !== undefined &&
          detail.viewStateId !== (activeViewStateId ?? activeFile.id)) ||
        !detail.claim()
      ) {
        return
      }
      save(detail.fileId)
    }
    window.addEventListener(AGENTSTART_EDITOR_REQUEST_CMD_SAVE_EVENT, handler)
    return () => window.removeEventListener(AGENTSTART_EDITOR_REQUEST_CMD_SAVE_EVENT, handler)
  }, [activeFile, activeViewStateId, save])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) {
      return
    }
    const handler = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.repeat || !editorShortcutMatches('editor.save', event)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const target = event.target instanceof HTMLElement ? event.target : null
      const saveOwnerFileId = target?.closest<HTMLElement>('[data-editor-save-file-id]')?.dataset
        .editorSaveFileId
      save(saveOwnerFileId ?? activeFile?.id ?? '')
    }
    panel.addEventListener('keydown', handler, { capture: true })
    return () => panel.removeEventListener('keydown', handler, { capture: true })
  }, [activeFile?.id, panelRef, save])
}
