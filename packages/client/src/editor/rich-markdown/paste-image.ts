import type { Editor } from '@tiptap/react'
import { toast } from 'sonner'
import { saveLocalClipboardImageAsTempFile } from '~renderer/runtime/clipboard-client'
import { extractRuntimeErrorMessage } from '~renderer/runtime/error-message'
import { settingsForRuntimeOwner } from '~renderer/runtime/rpc-client'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'

import { insertRichMarkdownImageFromPath } from './image-insert'

export type RichMarkdownImagePasteArgs = {
  editor: Editor | null
  event: ClipboardEvent
  filePath: string
  worktreeId: string | null
  runtimeEnvironmentId?: string | null
}

export function clipboardHasImage(event: ClipboardEvent): boolean {
  const data = event.clipboardData
  if (!data) {
    return false
  }
  return Array.from(data.items).some(
    (item) => item.kind === 'file' && item.type.startsWith('image/')
  )
}

export function handleRichMarkdownImagePaste({
  editor,
  event,
  filePath,
  worktreeId,
  runtimeEnvironmentId
}: RichMarkdownImagePasteArgs): boolean {
  if (!editor || !clipboardHasImage(event)) {
    return false
  }

  event.preventDefault()
  const insertPos = editor.state.selection.from
  const targetDom = editor.view.dom

  void saveClipboardImageForMarkdownPaste(runtimeEnvironmentId)
    .then((sourcePath) => {
      if (!sourcePath || !isRichMarkdownImagePasteTargetAvailable(editor, targetDom)) {
        return
      }
      return insertRichMarkdownImageFromPath({
        editor,
        filePath,
        sourcePath,
        worktreeId,
        runtimeEnvironmentId,
        insertPos,
        canInsert: (candidate) => isRichMarkdownImagePasteTargetAvailable(candidate, targetDom)
      })
    })
    .catch((err) => {
      toast.error(extractRuntimeErrorMessage(err, 'Failed to insert image.'))
    })

  return true
}

function isRichMarkdownImagePasteTargetAvailable(editor: Editor, targetDom: HTMLElement): boolean {
  return !editor.isDestroyed && editor.view.dom === targetDom && targetDom.isConnected
}

async function saveClipboardImageForMarkdownPaste(
  runtimeEnvironmentId?: string | null
): Promise<string | null> {
  const settings = settingsForRuntimeOwner(useAppStore.getState().settings, runtimeEnvironmentId)
  const hasRuntimeOwner = Boolean(settings?.activeRuntimeEnvironmentId?.trim())
  // Why: runtime-owned notes use runtime-side clipboard import; routing this
  // temp save through SSH would put the source file on the wrong machine.
  return hasRuntimeOwner
    ? shellClient.ui.saveClipboardImageAsTempFile()
    : saveLocalClipboardImageAsTempFile()
}
