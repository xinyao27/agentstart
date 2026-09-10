import { isWindowsAbsolutePathLike } from '@agentstart/protocol/host/path'
import { isWslUncPath } from '@agentstart/protocol/host/wsl-paths'

import { isWindowsUserAgent } from '../pane-interactions'

export type TerminalTargetShell = 'posix' | 'windows'

function getTerminalTargetShellForWorktreePath(worktreePath: string): TerminalTargetShell {
  if (isWslUncPath(worktreePath)) {
    return 'posix'
  }
  return isTerminalDropWindowsPathLike(worktreePath) ? 'windows' : 'posix'
}

export function resolveTerminalDropTargetShell({
  activeRuntimeEnvironmentId,
  worktreePath,
  connectionId,
  remotePlatform,
  userAgent
}: {
  activeRuntimeEnvironmentId: string | null | undefined
  worktreePath: string | null | undefined
  connectionId: string | null | undefined
  remotePlatform?: NodeJS.Platform | null
  userAgent?: string
}): TerminalTargetShell {
  if (activeRuntimeEnvironmentId?.trim() && worktreePath) {
    return getTerminalTargetShellForWorktreePath(worktreePath)
  }
  if (typeof connectionId === 'string') {
    return remotePlatform === 'win32' ? 'windows' : 'posix'
  }
  if (worktreePath && isWslUncPath(worktreePath)) {
    return 'posix'
  }
  return isWindowsUserAgent(userAgent) ? 'windows' : 'posix'
}

function isTerminalDropWindowsPathLike(path: string): boolean {
  if (isWslUncPath(path)) {
    return false
  }
  return isWindowsAbsolutePathLike(path) || path.includes('\\')
}
