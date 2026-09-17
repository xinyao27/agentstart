import { isWslUncPath } from '@agentstart/protocol/host/wsl-paths'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { getConnectionId } from '~renderer/runtime/connection-context'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'
import { readWorkspaceFileDragPaths } from '~renderer/workspace/file-drag'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

import type { ManagedPane, PaneManager } from '../pane-manager/pane-manager'
import type { PtyTransport } from '../pty/transport-types'
import { recordTerminalUserInputForLeaf } from '../terminal-input-activity'
import {
  formatTerminalImageDropSaveError,
  getTerminalImageDropRejectionMessage
} from './image-drop-messages'
import { isImageDropPath } from './image-path'
import { getTerminalInternalFileDropRejectionMessage } from './internal-rejection-message'
import { resolveTerminalDropPane } from './pane-resolution'
import { writeTerminalDropPathsToCapturedTarget } from './path-writer'
import { resolveTerminalDropTargetShell } from './shell'
import { captureTerminalDropTarget, type CapturedTerminalDropTarget } from './target'
import { carriesWorkspaceFilePaths } from './workspace-file-payload'
import { resolveTerminalDropWorktreePath } from './worktree-path'
import { showTerminalDropWriteFailure } from './write-failure'
import type { TerminalDropWriteFailureReason } from './write-failure'
import { isWorktreeUsingLocalWslRuntime, toLocalWslDropPath } from './wsl-path'

const OS_FILE_DRAG_TYPE = 'Files'

type InternalArgs = {
  manager: PaneManager
  paneTransports: Map<number, PtyTransport>
  worktreeId: string
  tabId: string
  cwd?: string
  dataTransfer: Pick<DataTransfer, 'getData'>
  dropTarget?: EventTarget | null
}

export type InternalTerminalFileDropResult =
  | { status: 'ignored'; reason: 'empty' | 'no-pane' | 'no-transport' | 'worktree-unavailable' }
  | {
      status: 'cancelled'
      reason: TerminalDropWriteFailureReason
      pathCount: number
    }
  | { status: 'pasted'; pathCount: number }
  | { status: 'rejected'; reason: 'paths-too-large' | 'too-many-paths' }

type DropTargetResolution =
  | { status: 'resolved'; captured: CapturedTerminalDropTarget; pane: ManagedPane }
  | { status: 'ignored'; reason: 'no-pane' | 'no-transport' }

function resolveTerminalDropTarget(
  manager: PaneManager,
  paneTransports: Map<number, PtyTransport>,
  dropTarget: EventTarget | null | undefined
): DropTargetResolution {
  const pane = resolveTerminalDropPane(manager, dropTarget)
  if (!pane) {
    return { status: 'ignored', reason: 'no-pane' }
  }
  const transport = paneTransports.get(pane.id)
  if (!transport) {
    return { status: 'ignored', reason: 'no-transport' }
  }
  return { status: 'resolved', captured: captureTerminalDropTarget(pane, transport), pane }
}

/** True when a drag carries payloads the terminal can accept: workspace file paths or OS files. */
export function carriesTerminalDropPayload(dataTransfer: Pick<DataTransfer, 'types'>): boolean {
  return carriesWorkspaceFilePaths(dataTransfer) || dataTransfer.types.includes(OS_FILE_DRAG_TYPE)
}

export async function handleInternalTerminalFileDrop({
  manager,
  paneTransports,
  worktreeId,
  tabId,
  cwd,
  dataTransfer,
  dropTarget
}: InternalArgs): Promise<InternalTerminalFileDropResult> {
  const dragPaths = readWorkspaceFileDragPaths(dataTransfer)
  if (dragPaths.status === 'rejected') {
    toast.error(getTerminalInternalFileDropRejectionMessage(dragPaths.reason))
    return { status: 'rejected', reason: dragPaths.reason }
  }

  const paths = dragPaths.paths
  if (paths.length === 0) {
    return { status: 'ignored', reason: 'empty' }
  }

  const resolution = resolveTerminalDropTarget(manager, paneTransports, dropTarget)
  if (resolution.status === 'ignored') {
    return { status: 'ignored', reason: resolution.reason }
  }
  const { captured, pane } = resolution

  const state = useAppStore.getState()
  const worktreePath = resolveTerminalDropWorktreePath(worktreeId, cwd) ?? paths[0]
  if (!worktreePath) {
    return { status: 'ignored', reason: 'worktree-unavailable' }
  }
  const runtimeEnvironmentId = getRuntimeEnvironmentIdForWorktree(state, worktreeId)
  const connectionId = getConnectionId(worktreeId)
  if (!runtimeEnvironmentId && connectionId === undefined) {
    // Why: unresolved connection metadata means we cannot know whether these
    // worktree-owned paths belong to a local, WSL, or SSH terminal.
    toast.error(
      translate(
        'auto.components.terminal.pane.terminal.drop.handler.0c77693641',
        'Worktree not ready — try again in a moment.'
      )
    )
    return { status: 'ignored', reason: 'worktree-unavailable' }
  }
  const targetShell = resolveTerminalDropTargetShell({
    activeRuntimeEnvironmentId: runtimeEnvironmentId,
    worktreePath,
    // Why: internal Explorer drags paste worktree-owned paths directly, so SSH
    // shell semantics must come from the remote session, not the client OS.
    connectionId
  })
  const resolvedPaths =
    !runtimeEnvironmentId &&
    connectionId === null &&
    (isWslUncPath(worktreePath) || isWorktreeUsingLocalWslRuntime(state, worktreeId))
      ? paths.map(toLocalWslDropPath)
      : paths

  const writeResult = await writeTerminalDropPathsToCapturedTarget({
    dropTarget: captured,
    manager,
    paneTransports,
    paths: resolvedPaths,
    targetShell
  })
  showTerminalDropWriteFailure(writeResult.failureReason)
  if (writeResult.sentAnyPath) {
    recordTerminalUserInputForLeaf(tabId, pane.leafId)
  }
  if (writeResult.targetCurrent) {
    pane.terminal.focus()
  }
  if (writeResult.failureReason) {
    return {
      status: 'cancelled',
      reason: writeResult.failureReason,
      pathCount: writeResult.pathsWritten
    }
  }
  return { status: 'pasted', pathCount: writeResult.pathsWritten }
}

type ExternalImageArgs = {
  manager: PaneManager
  paneTransports: Map<number, PtyTransport>
  worktreeId: string
  tabId: string
  cwd?: string
  dataTransfer: Pick<DataTransfer, 'files'>
  dropTarget?: EventTarget | null
}

export type ExternalTerminalImageDropResult =
  | {
      status: 'ignored'
      reason: 'no-images' | 'no-pane' | 'no-transport' | 'worktree-unavailable' | 'save-failed'
    }
  | { status: 'cancelled'; reason: TerminalDropWriteFailureReason; pathCount: number }
  | { status: 'pasted'; pathCount: number }

export async function handleExternalTerminalImageDrop({
  manager,
  paneTransports,
  worktreeId,
  tabId,
  cwd,
  dataTransfer,
  dropTarget
}: ExternalImageArgs): Promise<ExternalTerminalImageDropResult> {
  const imageFiles = Array.from(dataTransfer.files).filter(isDroppedImageFile)
  if (imageFiles.length === 0) {
    toast.error(getTerminalImageDropRejectionMessage())
    return { status: 'ignored', reason: 'no-images' }
  }

  const resolution = resolveTerminalDropTarget(manager, paneTransports, dropTarget)
  if (resolution.status === 'ignored') {
    return { status: 'ignored', reason: resolution.reason }
  }
  const { captured, pane } = resolution

  const state = useAppStore.getState()
  const runtimeEnvironmentId = getRuntimeEnvironmentIdForWorktree(state, worktreeId)
  const connectionId = getConnectionId(worktreeId)
  if (!runtimeEnvironmentId && connectionId === undefined) {
    toast.error(
      translate(
        'auto.components.terminal.pane.terminal.drop.handler.0c77693641',
        'Worktree not ready — try again in a moment.'
      )
    )
    return { status: 'ignored', reason: 'worktree-unavailable' }
  }
  const targetShell = resolveTerminalDropTargetShell({
    activeRuntimeEnvironmentId: runtimeEnvironmentId,
    worktreePath: resolveTerminalDropWorktreePath(worktreeId, cwd),
    connectionId
  })

  // Why: an OS drop only hands the browser file contents, never a path, so the
  // image is uploaded to the host that owns the terminal and the returned temp
  // path is injected as a bracketed paste — the same contract clipboard
  // screenshots use (terminal-clipboard-paste.ts).
  const paths: string[] = []
  for (const file of imageFiles) {
    try {
      paths.push(
        await shellClient.ui.saveImageBlobAsTempFile(file, { connectionId, runtimeEnvironmentId })
      )
    } catch (error) {
      toast.error(formatTerminalImageDropSaveError(error))
      return { status: 'ignored', reason: 'save-failed' }
    }
  }

  const writeResult = await writeTerminalDropPathsToCapturedTarget({
    dropTarget: captured,
    manager,
    paneTransports,
    paths,
    targetShell
  })
  showTerminalDropWriteFailure(writeResult.failureReason)
  if (writeResult.sentAnyPath) {
    recordTerminalUserInputForLeaf(tabId, pane.leafId)
  }
  if (writeResult.targetCurrent) {
    pane.terminal.focus()
  }
  if (writeResult.failureReason) {
    return {
      status: 'cancelled',
      reason: writeResult.failureReason,
      pathCount: writeResult.pathsWritten
    }
  }
  return { status: 'pasted', pathCount: writeResult.pathsWritten }
}

function isDroppedImageFile(file: File): boolean {
  return file.type.startsWith('image/') || isImageDropPath(file.name)
}
