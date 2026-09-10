import { isWslUncPath } from '@agentstart/protocol/host/wsl-paths'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { getConnectionId } from '~renderer/runtime/connection-context'
import { useAppStore } from '~renderer/store/state'
import { readWorkspaceFileDragPaths } from '~renderer/workspace/file-drag'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

import type { PaneManager } from '../pane-manager/pane-manager'
import type { PtyTransport } from '../pty/transport-types'
import { recordTerminalUserInputForLeaf } from '../terminal-input-activity'
import { getTerminalInternalFileDropRejectionMessage } from './internal-rejection-message'
import { resolveInternalTerminalDropPane } from './pane-resolution'
import { writeTerminalDropPathsToCapturedTarget } from './path-writer'
import { resolveTerminalDropTargetShell } from './shell'
import { captureTerminalDropTarget } from './target'
import { resolveTerminalDropWorktreePath } from './worktree-path'
import { showTerminalDropWriteFailure } from './write-failure'
import type { TerminalDropWriteFailureReason } from './write-failure'
import { isWorktreeUsingLocalWslRuntime, toLocalWslDropPath } from './wsl-path'

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

  const pane = resolveInternalTerminalDropPane(manager, dropTarget)
  if (!pane) {
    return { status: 'ignored', reason: 'no-pane' }
  }
  const transport = paneTransports.get(pane.id)
  if (!transport) {
    return { status: 'ignored', reason: 'no-transport' }
  }
  const dropTargetSnapshot = captureTerminalDropTarget(pane, transport)

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
    dropTarget: dropTargetSnapshot,
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
