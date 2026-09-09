import { parseExecutionHostId } from '@yiru/protocol/host/identity'
import { isWslUncPath } from '@yiru/protocol/host/wsl-paths'
import { runtimePtyEnvironmentId } from '@yiru/protocol/terminal-identity'
import { getConnectionIdFromState } from '~renderer/runtime/connection-context'
import type { AppState } from '~renderer/store/types'
import { getExecutionHostIdForWorktree } from '~renderer/worktree/runtime-owner'

import { isWslShellOverride } from './paste/runtime'
import type { PtyTransport } from './pty/transport-types'

type TerminalInputHostPlatformState = Pick<
  AppState,
  | 'repos'
  | 'worktreesByRepo'
  | 'folderWorkspaces'
  | 'projectGroups'
  | 'settings'
  | 'sshConnectionStates'
  | 'runtimeStatusByEnvironmentId'
  | 'restoredRuntimeHostIdByWorkspaceSessionKey'
>

export function resolveTerminalInputHostPlatform(args: {
  clientPlatform: NodeJS.Platform
  state: TerminalInputHostPlatformState
  worktreeId: string
  transport:
    | (Pick<PtyTransport, 'getConnectionId'> &
        Partial<
          Pick<PtyTransport, 'getPtyId' | 'getRuntimeEnvironmentId' | 'getLocalSessionMetadata'>
        >)
    | null
}): NodeJS.Platform {
  const transportConnectionId = args.transport?.getConnectionId?.()
  const connectionId =
    transportConnectionId === undefined
      ? getConnectionIdFromState(args.state, args.worktreeId)
      : transportConnectionId
  if (connectionId) {
    return args.state.sshConnectionStates.get(connectionId)?.remotePlatform ?? args.clientPlatform
  }

  // Why: a running pane keeps its spawn-time runtime even if the worktree's
  // selected host changes later, so the live PTY identity is authoritative.
  const ptyId = args.transport?.getPtyId?.() ?? null
  const runtimeEnvironmentId =
    args.transport?.getRuntimeEnvironmentId?.() ?? (ptyId ? runtimePtyEnvironmentId(ptyId) : null)
  if (runtimeEnvironmentId) {
    return (
      args.state.runtimeStatusByEnvironmentId.get(runtimeEnvironmentId)?.status?.hostPlatform ??
      args.clientPlatform
    )
  }
  const localSessionMetadata = args.transport?.getLocalSessionMetadata?.()
  if (ptyId !== null && localSessionMetadata != null) {
    const isWslSession =
      isWslUncPath(localSessionMetadata.cwd ?? '') ||
      isWslShellOverride(localSessionMetadata.shellOverride)
    return args.clientPlatform === 'win32' && isWslSession ? 'linux' : args.clientPlatform
  }

  const host = parseExecutionHostId(getExecutionHostIdForWorktree(args.state, args.worktreeId))
  if (host?.kind === 'runtime') {
    return (
      args.state.runtimeStatusByEnvironmentId.get(host.environmentId)?.status?.hostPlatform ??
      args.clientPlatform
    )
  }
  return args.clientPlatform
}
