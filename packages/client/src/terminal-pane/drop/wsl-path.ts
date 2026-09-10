import { isWindowsAbsolutePathLike } from '@agentstart/protocol/host/path'
import { parseWslUncPath } from '@agentstart/protocol/host/wsl-paths'
import { CLIENT_PLATFORM } from '~renderer/new-workspace/workspace-creation'
import { getLocalProjectExecutionRuntimeContext } from '~renderer/preflight/context'
import type { AppState } from '~renderer/store/types'

export function isWorktreeUsingLocalWslRuntime(state: AppState, worktreeId: string): boolean {
  const projectRuntime = getLocalProjectExecutionRuntimeContext(state, worktreeId, CLIENT_PLATFORM)
  if (projectRuntime?.status === 'repair-required') {
    return projectRuntime.repair.preferredRuntime.kind === 'wsl'
  }
  return projectRuntime?.status === 'resolved' && projectRuntime.runtime.kind === 'wsl'
}

export function toLocalWslDropPath(path: string): string {
  const wslUnc = parseWslUncPath(path)
  if (wslUnc) {
    return wslUnc.linuxPath
  }
  if (isWindowsAbsolutePathLike(path)) {
    const drive = path[0].toLowerCase()
    return `/mnt/${drive}/${path.slice(3).replace(/\\/g, '/')}`
  }
  return path.replace(/\\/g, '/')
}
