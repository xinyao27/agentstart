import { runtimePtyEnvironmentId } from '@yiru/protocol/terminal-identity'
import { getLocalProjectExecutionRuntimeContext } from '~renderer/preflight/context'
import { getConnectionId } from '~renderer/runtime/connection-context'
import { getWorktreeMapFromState } from '~renderer/store/selectors'
import type { useAppStore } from '~renderer/store/state'
import {
  getCachedWindowsTerminalCapabilities,
  hasCachedWindowsTerminalCapabilities
} from '~renderer/terminal/windows/capabilities'
import {
  getExecutionHostIdForWorktree,
  getRuntimeEnvironmentIdForWorktree
} from '~renderer/worktree/runtime-owner'

import {
  isLocalNativeWindowsConpty,
  resolveWindowsShellOverride
} from '../pane-manager/windows-pty-compatibility'

type PtyRuntimeContextOptions = {
  state: ReturnType<typeof useAppStore.getState>
  worktreeId: string
  tabId: string
  cwd?: string
  restoredLeafId?: string | null
  restoredPtyIdByLeafId?: Record<string, string>
  clientPlatform: NodeJS.Platform
  userAgent: string
}

export function resolvePtyRuntimeContext(options: PtyRuntimeContextOptions) {
  const worktree = getWorktreeMapFromState(options.state).get(options.worktreeId)
  const connectionId = getConnectionId(options.worktreeId) ?? null
  const tab = (options.state.tabsByWorktree[options.worktreeId] ?? []).find(
    (candidate) => candidate.id === options.tabId
  )
  const shellOverride = tab?.shellOverride
  const executionHostId = getExecutionHostIdForWorktree(options.state, options.worktreeId)
  // Why: a remote-runtime pane can have a Linux cwd on a Windows client. The
  // execution host, not the renderer platform alone, decides ConPTY ownership.
  const isNativeWindowsConpty = isLocalNativeWindowsConpty({
    userAgent: options.userAgent,
    connectionId,
    cwd: options.cwd,
    shellOverride: resolveWindowsShellOverride(
      shellOverride,
      options.state.settings?.terminalWindowsShell
    ),
    executionHostId
  })
  const restoredPtyId =
    options.restoredLeafId && options.restoredPtyIdByLeafId
      ? (options.restoredPtyIdByLeafId[options.restoredLeafId] ?? null)
      : null
  const restoredEnvironmentId =
    (restoredPtyId ? runtimePtyEnvironmentId(restoredPtyId) : null) ??
    (tab?.ptyId ? runtimePtyEnvironmentId(tab.ptyId) : null)
  const runtimeEnvironmentId =
    restoredEnvironmentId ?? getRuntimeEnvironmentIdForWorktree(options.state, options.worktreeId)
  const localWindowsCapabilities = hasCachedWindowsTerminalCapabilities()
    ? getCachedWindowsTerminalCapabilities()
    : null
  const projectRuntime =
    !connectionId && runtimeEnvironmentId === null
      ? getLocalProjectExecutionRuntimeContext(options.state, options.worktreeId, undefined, {
          wslAvailable: localWindowsCapabilities?.wslAvailable,
          availableWslDistros: localWindowsCapabilities?.wslDistros ?? null
        })
      : undefined

  return {
    connectionId,
    isNativeWindowsConpty,
    projectRuntime,
    restoredPtyId,
    runtimeEnvironmentId,
    shellOverride,
    shouldApplyWindowsRendererUnicodeRefresh: options.clientPlatform === 'win32',
    shouldOwnAgentStatusInRenderer: runtimeEnvironmentId !== null,
    worktree
  }
}
