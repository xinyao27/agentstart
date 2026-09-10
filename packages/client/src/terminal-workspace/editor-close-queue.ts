import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useAppStore } from '~renderer/store/state'

import {
  AGENTSTART_EDITOR_REQUEST_FILE_CLOSE_EVENT,
  AGENTSTART_EDITOR_SAVE_AND_CLOSE_EVENT,
  type EditorRequestFileCloseDetail,
  requestEditorSaveQuiesce
} from '../editor/autosave'
import type { OpenFile } from '../editor/state'
import { appendUniqueOpenFileIds } from '../terminal/unsaved-close-queue'
import { isPinnedActiveEditorTab } from './tab-model-lookup'

// Why: after a close-dialog handler advances the queue and renders the next
// dialog, gate new handler runs for this long so a stray carry-over click
// from the prior dialog can't silently act on the new one. Short enough to
// feel responsive on a deliberate follow-up click; long enough to absorb the
// trailing edge of a physical double-click (~150 ms on most hardware).
const CLOSE_DIALOG_DEBOUNCE_MS = 200

export type QueueEditorCloseRequests = (fileIds: string[]) => void

type EditorCloseQueueArgs = {
  onQueueDrained: () => void
  onQueueCancelled: () => void
}

type EditorCloseQueue = {
  saveDialogFileId: string | null
  saveDialogFile: OpenFile | null
  handleCloseFile: (fileId: string) => void
  queueEditorCloseRequests: QueueEditorCloseRequests
  handleSaveDialogSave: () => Promise<void>
  handleSaveDialogDiscard: () => Promise<void>
  handleSaveDialogCancel: () => void
}

// Why: gates individual editor-tab closes behind one unsaved-changes
// save/discard/cancel dialog so only one prompt is in flight at a time.
export function useEditorCloseQueue({
  onQueueDrained,
  onQueueCancelled
}: EditorCloseQueueArgs): EditorCloseQueue {
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const openFiles = useAppStore((s) => s.openFiles)
  const closeFile = useAppStore((s) => s.closeFile)
  const markFileDirty = useAppStore((s) => s.markFileDirty)
  const setActiveFile = useAppStore((s) => s.setActiveFile)
  const setActiveTabType = useAppStore((s) => s.setActiveTabType)
  const setActiveWorktree = useAppStore((s) => s.setActiveWorktree)

  const [saveDialogFileId, setSaveDialogFileId] = useState<string | null>(null)
  const saveDialogFile = saveDialogFileId
    ? (openFiles.find((f) => f.id === saveDialogFileId) ?? null)
    : null
  const pendingEditorCloseQueueRef = useRef<string[]>([])

  // Why: while a save-and-close is awaiting the file to disappear from
  // openFiles, concurrent queueEditorCloseRequests calls (e.g. user clicks X
  // on another dirty tab, or a split-group dispatch fires
  // AGENTSTART_EDITOR_REQUEST_FILE_CLOSE_EVENT) must not re-open the dialog over
  // the in-flight save. Track the in-flight file here so
  // getNextQueuedEditorClose can skip it as an un-advanceable head.
  const inFlightSaveFileIdRef = useRef<string | null>(null)

  // Why: after a Save/Discard/Cancel handler dismisses its dialog and advances
  // the queue, a rapid second physical click can land on the freshly-rendered
  // next dialog's button before the user has read the filename — silently
  // discarding or saving work they didn't consciously choose to act on. Gate
  // the three handlers on this ref and release after CLOSE_DIALOG_DEBOUNCE_MS
  // so the stray click from the previous dialog is absorbed while a genuine
  // new click on the next dialog still works.
  const isClosingRef = useRef(false)
  const closeDialogDebounceTimersRef = useRef<Set<number>>(new Set())
  const releaseCloseDialogGuardAfterDebounce = () => {
    const timer = window.setTimeout(() => {
      closeDialogDebounceTimersRef.current.delete(timer)
      isClosingRef.current = false
    }, CLOSE_DIALOG_DEBOUNCE_MS)
    closeDialogDebounceTimersRef.current.add(timer)
  }

  useEffect(() => {
    const timers = closeDialogDebounceTimersRef.current
    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])

  const getNextQueuedEditorClose = (): string | null => {
    // Why: bulk close actions can enqueue files that become clean or disappear
    // before they reach the front. Drain those entries eagerly so the dialog
    // only blocks on tabs that still require an explicit close decision.
    while (pendingEditorCloseQueueRef.current.length > 0) {
      const fileId = pendingEditorCloseQueueRef.current[0]
      // Why: if a save is still in-flight for this fileId, do not re-open the
      // dialog on top of it. waitForFileClosed will re-advance the queue once
      // the file finishes closing (or the save times out).
      if (inFlightSaveFileIdRef.current === fileId) {
        return null
      }
      const file = useAppStore.getState().openFiles.find((candidate) => candidate.id === fileId)
      if (!file) {
        pendingEditorCloseQueueRef.current.shift()
        continue
      }
      if (!file.isDirty) {
        closeFile(fileId)
        pendingEditorCloseQueueRef.current.shift()
        continue
      }
      return fileId
    }
    return null
  }

  const advanceEditorCloseQueue = () => {
    const nextFileId = getNextQueuedEditorClose()
    if (nextFileId) {
      // Why: bulk closes can cross worktree boundaries. Switch to the target
      // worktree so the UI behind the dialog matches the filename in it.
      const state = useAppStore.getState()
      const file = state.openFiles.find((f) => f.id === nextFileId)
      if (file && file.worktreeId !== state.activeWorktreeId) {
        setActiveWorktree(file.worktreeId)
      }
      setActiveFile(nextFileId)
      setActiveTabType('editor')
      setSaveDialogFileId(nextFileId)
      return
    }
    setSaveDialogFileId(null)
    onQueueDrained()
  }

  const queueEditorCloseRequests = useEventCallback((fileIds: string[]) => {
    pendingEditorCloseQueueRef.current = appendUniqueOpenFileIds(
      pendingEditorCloseQueueRef.current,
      fileIds,
      new Set(useAppStore.getState().openFiles.map((file) => file.id))
    )
    advanceEditorCloseQueue()
  })

  const handleCloseFile = (fileId: string) => {
    const state = useAppStore.getState()
    if (activeWorktreeId && isPinnedActiveEditorTab(state, activeWorktreeId, fileId)) {
      return
    }
    const file = state.openFiles.find((f) => f.id === fileId)
    if (file?.isDirty) {
      queueEditorCloseRequests([fileId])
      return
    }
    closeFile(fileId)
  }

  const handleSaveDialogSave = async () => {
    if (isClosingRef.current) {
      return
    }
    if (!saveDialogFileId) {
      return
    }
    isClosingRef.current = true
    const fileId = saveDialogFileId
    const file = useAppStore.getState().openFiles.find((f) => f.id === fileId)
    if (!file) {
      pendingEditorCloseQueueRef.current = pendingEditorCloseQueueRef.current.filter(
        (id) => id !== fileId
      )
      advanceEditorCloseQueue()
      releaseCloseDialogGuardAfterDebounce()
      return
    }

    // Why: save-and-close must flush the latest draft even when the visible
    // editor panel has already unmounted. The headless autosave controller
    // owns that write path now, so the dialog signals it through a custom
    // event instead of poking at editor component refs.
    setSaveDialogFileId(null)
    window.dispatchEvent(
      new CustomEvent(AGENTSTART_EDITOR_SAVE_AND_CLOSE_EVENT, { detail: { fileId } })
    )
    inFlightSaveFileIdRef.current = fileId
    let closed = false
    try {
      closed = await waitForFileClosed(fileId, 10_000)
    } finally {
      // Why: clear the in-flight ref regardless of success/timeout so the
      // queue head is no longer treated as un-advanceable by
      // getNextQueuedEditorClose before we re-advance the queue below.
      if (inFlightSaveFileIdRef.current === fileId) {
        inFlightSaveFileIdRef.current = null
      }
    }
    if (!closed) {
      // Why: the save may have resolved in the tiny gap after the timeout
      // fired. Re-check synchronously so we don't re-open a stale dialog
      // for a file that is already gone — drain the queue entry and
      // advance instead. Toast only for the genuine timeout case.
      if (!useAppStore.getState().openFiles.some((f) => f.id === fileId)) {
        pendingEditorCloseQueueRef.current = pendingEditorCloseQueueRef.current.filter(
          (id) => id !== fileId
        )
        advanceEditorCloseQueue()
        releaseCloseDialogGuardAfterDebounce()
        return
      }
      toast.error(
        translate(
          'auto.components.Terminal.a2a279b32a',
          'Save timed out or failed. Fix errors before closing.'
        )
      )
      setSaveDialogFileId(fileId)
      // Why: a genuine timeout leaves the user back on the same dialog, so
      // release the guard immediately — a new click here is a deliberate
      // retry, not a stray carry-over from a prior dialog.
      isClosingRef.current = false
      return
    }
    pendingEditorCloseQueueRef.current = pendingEditorCloseQueueRef.current.filter(
      (id) => id !== fileId
    )
    advanceEditorCloseQueue()
    releaseCloseDialogGuardAfterDebounce()
  }

  const handleSaveDialogDiscard = async () => {
    if (isClosingRef.current) {
      return
    }
    if (!saveDialogFileId) {
      return
    }
    isClosingRef.current = true
    const fileId = saveDialogFileId

    // Why: dismiss the dialog synchronously before awaiting quiesce. A rapid
    // double-click on "Don't Save" would otherwise fire the handler twice
    // with the same captured fileId, causing two concurrent queue advances
    // after the quiesce settles. Mirrors handleSaveDialogSave's early clear.
    setSaveDialogFileId(null)

    // Why: autosave runs on a background timer. Wait for any pending/in-flight
    // write to settle before honoring "Don't Save", otherwise the file can be
    // written after the user explicitly chose to discard their edits.
    try {
      await requestEditorSaveQuiesce({ fileId })
    } catch (error) {
      // Why: quiesce failure must not trap the user in a close dialog loop, but
      // silently swallowing it also hides broken autosave state. Warn so a
      // stuck controller is visible in devtools instead of disappearing.
      console.warn('Autosave quiesce failed before discard', error)
    }
    markFileDirty(fileId, false)
    closeFile(fileId)
    pendingEditorCloseQueueRef.current = pendingEditorCloseQueueRef.current.filter(
      (id) => id !== fileId
    )
    advanceEditorCloseQueue()
    releaseCloseDialogGuardAfterDebounce()
  }

  const handleSaveDialogCancel = () => {
    if (isClosingRef.current) {
      return
    }
    isClosingRef.current = true
    pendingEditorCloseQueueRef.current = []
    setSaveDialogFileId(null)
    onQueueCancelled()
    releaseCloseDialogGuardAfterDebounce()
  }

  useEffect(() => {
    const onRequestEditorClose = (event: Event): void => {
      const customEvent = event as CustomEvent<EditorRequestFileCloseDetail>
      const fileId = customEvent.detail?.fileId
      if (!fileId) {
        return
      }
      queueEditorCloseRequests([fileId])
    }
    window.addEventListener(
      AGENTSTART_EDITOR_REQUEST_FILE_CLOSE_EVENT,
      onRequestEditorClose as EventListener
    )
    return () =>
      window.removeEventListener(
        AGENTSTART_EDITOR_REQUEST_FILE_CLOSE_EVENT,
        onRequestEditorClose as EventListener
      )
  }, [queueEditorCloseRequests])

  return {
    saveDialogFileId,
    saveDialogFile,
    handleCloseFile,
    queueEditorCloseRequests,
    handleSaveDialogSave,
    handleSaveDialogDiscard,
    handleSaveDialogCancel
  }
}

function waitForFileClosed(fileId: string, timeoutMs: number): Promise<boolean> {
  if (!useAppStore.getState().openFiles.some((f) => f.id === fileId)) {
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    let unsub: (() => void) | null = null
    const timeoutId = window.setTimeout(() => {
      unsub?.()
      resolve(false)
    }, timeoutMs)
    unsub = useAppStore.subscribe((state) => {
      if (!state.openFiles.some((f) => f.id === fileId)) {
        window.clearTimeout(timeoutId)
        unsub?.()
        resolve(true)
      }
    })
    // Why: zustand only fires subscribers on subsequent state changes. If
    // the file closed between the initial guard and subscribe, the
    // transition was missed — re-check synchronously after subscribe.
    if (!useAppStore.getState().openFiles.some((f) => f.id === fileId)) {
      window.clearTimeout(timeoutId)
      unsub?.()
      resolve(true)
    }
  })
}
