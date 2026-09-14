import { toast } from 'sonner'
import { requestEditorSaveQuiesce } from '~renderer/editor/autosave'
import { basename, dirname, joinPath } from '~renderer/path'
import { getConnectionId } from '~renderer/runtime/connection-context'
import { extractRuntimeErrorMessage } from '~renderer/runtime/error-message'
import { renameRuntimePath } from '~renderer/runtime/file-client'
import { useAppStore } from '~renderer/store/state'

import { remapOpenEditorTabsForPathChange } from '../remap-open-editor-tabs-for-path-change'
import { getWorkspacePanelWorktreeRuntimeSettings } from './runtime-owner'
import { commitFileExplorerOp } from './undo-redo'

export function useFileExplorerPathMove({
  worktreePath,
  activeWorktreeId,
  refreshDir,
  clearDropTarget
}: {
  worktreePath: string | null
  activeWorktreeId: string | null
  refreshDir: (dirPath: string) => Promise<void>
  clearDropTarget: () => void
}): (sourcePath: string, destDir: string) => void {
  const openFiles = useAppStore((state) => state.openFiles)

  return (sourcePath: string, destDir: string) => {
    if (!worktreePath || !activeWorktreeId) {
      return
    }
    const fileName = basename(sourcePath)
    const sourceDir = dirname(sourcePath)
    clearDropTarget()
    if (
      sourceDir === destDir ||
      destDir === sourcePath ||
      destDir.startsWith(`${sourcePath}/`) ||
      destDir.startsWith(`${sourcePath}\\`)
    ) {
      return
    }

    const newPath = joinPath(destDir, fileName)
    const remapOpenTabs = (fromPath: string, toPath: string): void =>
      remapOpenEditorTabsForPathChange({
        fromPath,
        toPath,
        worktreePath,
        worktreeId: activeWorktreeId
      })
    const run = async (): Promise<void> => {
      const filesToMove = openFiles.filter(
        (file) =>
          file.filePath === sourcePath ||
          file.filePath.startsWith(`${sourcePath}/`) ||
          file.filePath.startsWith(`${sourcePath}\\`)
      )
      // Why: a move changes the write target, so settle saves before remapping tabs.
      await Promise.all(filesToMove.map((file) => requestEditorSaveQuiesce({ fileId: file.id })))

      try {
        const connectionId = getConnectionId(activeWorktreeId) ?? undefined
        const fileContext = {
          settings: getWorkspacePanelWorktreeRuntimeSettings(activeWorktreeId),
          worktreeId: activeWorktreeId,
          worktreePath,
          connectionId
        }
        await renameRuntimePath(fileContext, sourcePath, newPath)
        commitFileExplorerOp({
          undo: async () => {
            await renameRuntimePath(fileContext, newPath, sourcePath)
            await Promise.all([refreshDir(destDir), refreshDir(sourceDir)])
            remapOpenTabs(newPath, sourcePath)
          },
          redo: async () => {
            await renameRuntimePath(fileContext, sourcePath, newPath)
            await Promise.all([refreshDir(sourceDir), refreshDir(destDir)])
            remapOpenTabs(sourcePath, newPath)
          }
        })
      } catch (error) {
        toast.error(extractRuntimeErrorMessage(error, `Failed to move '${fileName}'.`))
        return
      }
      await Promise.all([refreshDir(sourceDir), refreshDir(destDir)])
      remapOpenTabs(sourcePath, newPath)
    }
    void run()
  }
}
