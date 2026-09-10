import type { ExecutionHostId } from '@agentstart/protocol/host/identity'
import { LOCAL_EXECUTION_HOST_ID } from '@agentstart/protocol/host/identity'
import { isRuntimePtyId } from '@agentstart/protocol/terminal-identity'
import { getConnectionIdFromState } from '~renderer/runtime/connection-context'
import { isLocalNativeWindowsConpty } from '~renderer/terminal-pane/pane-manager/windows-pty-compatibility'
import {
  getExecutionHostIdForWorktree,
  type WorktreeRuntimeOwnerState
} from '~renderer/worktree/runtime-owner'

import type { PtyTransport } from './pty/transport-types'
import type { PaneCwdMap } from './resolve-split-cwd'

type TerminalTabShellState = {
  tabsByWorktree: Record<
    string,
    readonly { id: string; shellOverride?: string | null }[] | undefined
  >
}

type TerminalCtrlArrowConptyState = Parameters<typeof getConnectionIdFromState>[0] &
  WorktreeRuntimeOwnerState &
  TerminalTabShellState

type TerminalCtrlArrowConptyTransport = Pick<
  PtyTransport,
  'getPtyId' | 'getConnectionId' | 'getLocalSessionMetadata'
>

type TerminalCtrlArrowConptyArgs = {
  isWindows: boolean
  userAgent: string
  state: TerminalCtrlArrowConptyState
  worktreeId: string
  tabId: string
  paneId: number
  paneCwd: PaneCwdMap
  fallbackCwd: string
  transport: TerminalCtrlArrowConptyTransport | null
}

export function isLocalWindowsConptyPaneForCtrlArrow({
  isWindows,
  userAgent,
  state,
  worktreeId,
  tabId,
  paneId,
  paneCwd,
  fallbackCwd,
  transport
}: TerminalCtrlArrowConptyArgs): boolean {
  if (!isWindows) {
    return false
  }

  const ptyId = transport?.getPtyId() ?? null
  if (ptyId !== null && isRuntimePtyId(ptyId)) {
    return false
  }

  const sessionMetadata = transport?.getLocalSessionMetadata?.()
  const hasLiveLocalSession =
    ptyId !== null && sessionMetadata !== null && sessionMetadata !== undefined
  const transportConnectionId = transport?.getConnectionId?.()
  const connectionId = hasLiveLocalSession
    ? null
    : transportConnectionId === undefined
      ? getConnectionIdFromState(state, worktreeId)
      : transportConnectionId
  const tabShellOverride = state.tabsByWorktree[worktreeId]?.find(
    (candidate) => candidate.id === tabId
  )?.shellOverride
  const executionHostId: ExecutionHostId = hasLiveLocalSession
    ? LOCAL_EXECUTION_HOST_ID
    : getExecutionHostIdForWorktree(state, worktreeId)

  return isLocalNativeWindowsConpty({
    userAgent,
    connectionId,
    cwd: sessionMetadata?.cwd ?? paneCwd.get(paneId)?.cwd ?? fallbackCwd,
    shellOverride: sessionMetadata?.shellOverride ?? tabShellOverride,
    executionHostId
  })
}
