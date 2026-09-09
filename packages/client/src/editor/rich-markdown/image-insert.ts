import type { Editor } from '@tiptap/react'
import { parseWorkspaceKey } from '@yiru/protocol/workspace/identity'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { dirname, basename } from '~renderer/path'
import { getConnectionId } from '~renderer/runtime/connection-context'
import { extractRuntimeErrorMessage } from '~renderer/runtime/error-message'
import { importExternalPathsToRuntime } from '~renderer/runtime/file-client'
import { settingsForRuntimeOwner } from '~renderer/runtime/rpc-client'
import { useAppStore } from '~renderer/store/state'

export type RichMarkdownImageInsertArgs = {
  editor: Editor
  filePath: string
  sourcePath: string
  worktreeId: string | null
  runtimeEnvironmentId?: string | null
  insertPos: number
  canInsert?: (editor: Editor) => boolean
}

export async function insertRichMarkdownImageFromPath({
  editor,
  filePath,
  sourcePath,
  worktreeId,
  runtimeEnvironmentId,
  insertPos,
  canInsert
}: RichMarkdownImageInsertArgs): Promise<void> {
  try {
    const connectionId = getConnectionId(worktreeId) ?? undefined
    const settings = settingsForRuntimeOwner(useAppStore.getState().settings, runtimeEnvironmentId)
    const worktreePath = getWorktreePath(worktreeId)
    if (settings?.activeRuntimeEnvironmentId?.trim() && !worktreePath) {
      toast.error(
        translate(
          'auto.components.editor.useLocalImagePick.91d835dc88',
          'Worktree path not available.'
        )
      )
      return
    }

    // Why: image bytes should live beside the note instead of inside markdown;
    // this keeps rich-mode size checks based on document text, not binary data.
    const { results } = await importExternalPathsToRuntime(
      {
        settings,
        worktreeId,
        worktreePath,
        connectionId
      },
      [sourcePath],
      dirname(filePath)
    )
    const imported = results.find((result) => result.status === 'imported')
    if (!imported) {
      toast.error(
        translate('auto.components.editor.useLocalImagePick.175cb8b8ce', 'Failed to insert image.')
      )
      return
    }

    if (canInsert && !canInsert(editor)) {
      return
    }

    const imageSrc = encodeMarkdownImageBasename(imported.destPath)
    const inserted = editor
      .chain()
      .focus()
      .insertContentAt(insertPos, { type: 'image', attrs: { src: imageSrc } })
      .run()
    if (!inserted) {
      toast.error(
        translate('auto.components.editor.useLocalImagePick.175cb8b8ce', 'Failed to insert image.')
      )
    }
  } catch (err) {
    toast.error(extractRuntimeErrorMessage(err, 'Failed to insert image.'))
  }
}

function encodeMarkdownImageBasename(destPath: string): string {
  // Why: unescaped spaces and delimiters in markdown image destinations make
  // screenshot filenames render as literal text or broken partial paths.
  return encodeURIComponent(basename(destPath))
}

function getWorktreePath(worktreeId: string | null): string | null {
  if (!worktreeId) {
    return null
  }
  const state = useAppStore.getState()
  const parsedWorkspaceKey = parseWorkspaceKey(worktreeId)
  if (parsedWorkspaceKey?.type === 'folder') {
    return (
      state.folderWorkspaces.find(
        (workspace) => workspace.id === parsedWorkspaceKey.folderWorkspaceId
      )?.folderPath ?? null
    )
  }
  const worktrees = Object.values(state.worktreesByRepo ?? {}).flat()
  return worktrees.find((worktree) => worktree.id === worktreeId)?.path ?? null
}
