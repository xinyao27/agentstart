import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useEventCallback } from '~renderer/react/use-event-callback'
import {
  getWorkspaceFileDragRejectionMessage,
  readWorkspaceFileDragPaths,
  WORKSPACE_FILE_PATH_MIME
} from '~renderer/workspace/file-drag'

import { useFileExplorerDragEdgeScroll } from './drag-edge-scroll'
import { useFileExplorerPathMove } from './path-move'

type UseFileExplorerDragDropParams = {
  worktreePath: string | null
  activeWorktreeId: string | null
  expanded: Set<string>
  toggleDir: (worktreeId: string, dirPath: string) => void
  refreshDir: (dirPath: string) => Promise<void>
  scrollElement: HTMLDivElement | null
}

type UseFileExplorerDragDropResult = {
  handleMoveDrop: (sourcePath: string, destDir: string) => void
  handleDragExpandDir: (dirPath: string) => void
  dropTargetDir: string | null
  setDropTargetDir: (dir: string | null) => void
  dragSourcePath: string | null
  setDragSourcePath: (path: string | null) => void
  isRootDragOver: boolean
  stopDragEdgeScroll: () => void
  rootDragHandlers: {
    onDragOver: (event: React.DragEvent) => void
    onDragEnter: (event: React.DragEvent) => void
    onDragLeave: (event: React.DragEvent) => void
    onDrop: (event: React.DragEvent) => void
  }
}

export function useFileExplorerDragDrop({
  worktreePath,
  activeWorktreeId,
  expanded,
  toggleDir,
  refreshDir,
  scrollElement
}: UseFileExplorerDragDropParams): UseFileExplorerDragDropResult {
  const [isRootDragOver, setIsRootDragOver] = useState(false)
  const rootDragCounterRef = useRef(0)
  const [dropTargetDir, setDropTargetDir] = useState<string | null>(null)
  const [dragSourcePath, setDragSourcePath] = useState<string | null>(null)
  const { recordDragClientY, stopDragEdgeScroll } = useFileExplorerDragEdgeScroll(scrollElement)
  const clearDropTarget = () => setDropTargetDir(null)
  const handleMoveDrop = useFileExplorerPathMove({
    worktreePath,
    activeWorktreeId,
    refreshDir,
    clearDropTarget
  })

  const clearDragState = () => {
    rootDragCounterRef.current = 0
    setIsRootDragOver(false)
    setDropTargetDir(null)
    setDragSourcePath(null)
  }
  const stopAndClearDragState = useEventCallback(() => {
    clearDragState()
    stopDragEdgeScroll()
  })

  useEffect(() => {
    const handleGlobalDragFinish = (): void => {
      stopAndClearDragState()
    }
    document.addEventListener('drop', handleGlobalDragFinish, true)
    document.addEventListener('dragend', handleGlobalDragFinish, true)
    window.addEventListener('blur', handleGlobalDragFinish)
    return () => {
      stopDragEdgeScroll()
      document.removeEventListener('drop', handleGlobalDragFinish, true)
      document.removeEventListener('dragend', handleGlobalDragFinish, true)
      window.removeEventListener('blur', handleGlobalDragFinish)
    }
  }, [stopAndClearDragState, stopDragEdgeScroll])

  const handleRootDragOver = (event: React.DragEvent) => {
    const isInternal = event.dataTransfer.types.includes(WORKSPACE_FILE_PATH_MIME)
    if (!isInternal) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    recordDragClientY(event.clientY)
  }
  const handleRootDragEnter = (event: React.DragEvent) => {
    const isInternal = event.dataTransfer.types.includes(WORKSPACE_FILE_PATH_MIME)
    if (!isInternal) {
      return
    }
    event.preventDefault()
    rootDragCounterRef.current += 1
    setIsRootDragOver(true)
  }
  const handleRootDragLeave = () => {
    rootDragCounterRef.current -= 1
    if (rootDragCounterRef.current <= 0) {
      rootDragCounterRef.current = 0
      setIsRootDragOver(false)
    }
    if (rootDragCounterRef.current === 0) {
      stopDragEdgeScroll()
    }
  }
  const handleRootDrop = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes(WORKSPACE_FILE_PATH_MIME)) {
      return
    }
    event.preventDefault()
    stopDragEdgeScroll()
    rootDragCounterRef.current = 0
    setIsRootDragOver(false)
    setDropTargetDir(null)
    if (!worktreePath) {
      return
    }
    const dragPaths = readWorkspaceFileDragPaths(event.dataTransfer)
    if (dragPaths.status === 'rejected') {
      toast.error(getWorkspaceFileDragRejectionMessage(dragPaths.reason))
      return
    }
    for (const sourcePath of dragPaths.paths) {
      handleMoveDrop(sourcePath, worktreePath)
    }
  }
  // Why: the row/root drop targets consume these handlers as one capability
  // group instead of each reconstructing the mapping independently.
  const rootDragHandlers = (() => ({
    onDragOver: handleRootDragOver,
    onDragEnter: handleRootDragEnter,
    onDragLeave: handleRootDragLeave,
    onDrop: handleRootDrop
  }))()

  const handleDragExpandDir = (dirPath: string) => {
    if (activeWorktreeId && !expanded.has(dirPath)) {
      toggleDir(activeWorktreeId, dirPath)
    }
  }
  // Why: the interaction surface consumes drag and drop as one capability
  // group rather than coupling to the hook's internal state.
  return (() => ({
    handleMoveDrop,
    handleDragExpandDir,
    dropTargetDir,
    setDropTargetDir,
    dragSourcePath,
    setDragSourcePath,
    isRootDragOver,
    stopDragEdgeScroll,
    rootDragHandlers
  }))()
}
