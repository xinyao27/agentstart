import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { renameFileOnDisk } from '~renderer/editor/rename-file'
import { detectLanguage } from '~renderer/file-presentation/language-detect'
import { dirname, joinPath } from '~renderer/path'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { getConnectionId } from '~renderer/runtime/connection-context'
import { extractRuntimeErrorMessage } from '~renderer/runtime/error-message'
import { createRuntimePath, deleteRuntimePath } from '~renderer/runtime/file-client'
import { useAppStore } from '~renderer/store/state'

import type { InlineInput } from './row'
import type { FileExplorerRowProjection } from './row-projection'
import { getWorkspacePanelWorktreeRuntimeSettings } from './runtime-owner'
import type { TreeNode } from './types'
import { commitFileExplorerOp } from './undo-redo'

type UseFileExplorerInlineInputParams = {
  activeWorktreeId: string | null
  worktreePath: string | null
  expanded: Set<string>
  rowProjection: FileExplorerRowProjection
  scrollElement: HTMLDivElement | null
  refreshDir: (dirPath: string) => Promise<void>
}

type UseFileExplorerInlineInputResult = {
  inlineInput: InlineInput | null
  inlineInputIndex: number
  startNew: (type: 'file' | 'folder', parentPath: string, depth: number) => void
  startRename: (node: TreeNode) => void
  dismissInlineInput: () => void
  handleInlineSubmit: (value: string) => void
}

export function useFileExplorerInlineInput({
  activeWorktreeId,
  worktreePath,
  expanded,
  rowProjection,
  scrollElement,
  refreshDir
}: UseFileExplorerInlineInputParams): UseFileExplorerInlineInputResult {
  const toggleDir = useAppStore((s) => s.toggleDir)
  const openFile = useAppStore((s) => s.openFile)
  const [inlineInput, setInlineInput] = useState<InlineInput | null>(null)
  const scrollFocusFrameRef = useRef<number | null>(null)

  const cancelScrollFocusFrame = useEventCallback((): void => {
    if (scrollFocusFrameRef.current === null) {
      return
    }
    cancelAnimationFrame(scrollFocusFrameRef.current)
    scrollFocusFrameRef.current = null
  })

  useEffect(() => cancelScrollFocusFrame, [cancelScrollFocusFrame])

  const scheduleScrollFocus = (): void => {
    cancelScrollFocusFrame()
    scrollFocusFrameRef.current = requestAnimationFrame(() => {
      scrollFocusFrameRef.current = null
      scrollElement?.focus()
    })
  }

  const inlineInputIndex = (() => {
    if (!inlineInput || inlineInput.type === 'rename') {
      return -1
    }
    return rowProjection.getInsertIndexAfterSubtree(inlineInput.parentPath, worktreePath)
  })()

  const startNew = (type: 'file' | 'folder', parentPath: string, depth: number) => {
    if (activeWorktreeId && parentPath !== worktreePath && !expanded.has(parentPath)) {
      toggleDir(activeWorktreeId, parentPath)
    }
    setInlineInput({ parentPath, type, depth })
  }

  const startRename = (node: TreeNode) =>
    setInlineInput({
      parentPath: dirname(node.path),
      type: 'rename',
      depth: node.depth,
      existingName: node.name,
      existingPath: node.path
    })

  const dismissInlineInput = () => {
    setInlineInput(null)
    scheduleScrollFocus()
  }

  const handleInlineSubmit = (value: string) => {
    if (!inlineInput || !value.trim() || !activeWorktreeId || !worktreePath) {
      setInlineInput(null)
      return
    }
    const name = value.trim()
    // No-op if the user submitted the same name (e.g. blur without editing)
    if (inlineInput.type === 'rename' && name === inlineInput.existingName) {
      setInlineInput(null)
      return
    }
    const run = async (): Promise<void> => {
      const connectionId = getConnectionId(activeWorktreeId ?? null) ?? undefined
      const fileContext = {
        settings: getWorkspacePanelWorktreeRuntimeSettings(activeWorktreeId),
        worktreeId: activeWorktreeId,
        worktreePath,
        connectionId
      }
      if (inlineInput.type === 'rename' && inlineInput.existingPath) {
        await renameFileOnDisk({
          oldPath: inlineInput.existingPath,
          newName: name,
          worktreeId: activeWorktreeId,
          worktreePath,
          refreshDir
        })
      } else {
        const fullPath = joinPath(inlineInput.parentPath, name)
        try {
          await createRuntimePath(
            fileContext,
            fullPath,
            inlineInput.type === 'folder' ? 'directory' : 'file'
          )
          const parentForRefresh = inlineInput.parentPath
          if (inlineInput.type === 'folder') {
            commitFileExplorerOp({
              undo: async () => {
                await deleteRuntimePath(fileContext, fullPath, true)
                await refreshDir(parentForRefresh)
              },
              redo: async () => {
                await createRuntimePath(fileContext, fullPath, 'directory')
                await refreshDir(parentForRefresh)
              }
            })
          } else {
            commitFileExplorerOp({
              undo: async () => {
                await deleteRuntimePath(fileContext, fullPath)
                await refreshDir(parentForRefresh)
              },
              redo: async () => {
                await createRuntimePath(fileContext, fullPath, 'file')
                await refreshDir(parentForRefresh)
              }
            })
          }
          await refreshDir(inlineInput.parentPath)
          if (inlineInput.type === 'file') {
            const runtimeEnvironmentId =
              fileContext.settings.activeRuntimeEnvironmentId?.trim() || null
            openFile(
              {
                filePath: fullPath,
                relativePath: worktreePath ? fullPath.slice(worktreePath.length + 1) : name,
                worktreeId: activeWorktreeId,
                runtimeEnvironmentId: runtimeEnvironmentId ?? undefined,
                language: detectLanguage(name),
                mode: 'edit'
              },
              { suppressActiveRuntimeFallback: runtimeEnvironmentId === null }
            )
          }
        } catch (err) {
          // Refresh the directory even on failure so the tree stays consistent
          await refreshDir(inlineInput.parentPath)
          toast.error(extractRuntimeErrorMessage(err, `Failed to create '${name}'.`))
        }
      }
    }
    void run()
    setInlineInput(null)
    scheduleScrollFocus()
  }

  // Why: the tree consumes inline editing as one capability group.
  return (() => ({
    inlineInput,
    inlineInputIndex,
    startNew,
    startRename,
    dismissInlineInput,
    handleInlineSubmit
  }))()
}
