import type { AgentStartupShell, StartupHostPlatform } from '@yiru/protocol/agent/shell-command'
import { resolveWindowsShellStartupFamily } from '@yiru/protocol/host/windows-terminal-shell'
import type { RuntimeStatusResult } from '~renderer/runtime/status/model'

export type AgentLaunchHost = {
  platform: StartupHostPlatform
  shell: AgentStartupShell
}

export function resolveRemoteAgentLaunchHost(
  status: Pick<RuntimeStatusResult, 'hostPlatform' | 'terminalWindowsShell'>
): AgentLaunchHost | null {
  const platform = status.hostPlatform
  if (!platform) {
    return null
  }
  return {
    platform,
    shell:
      platform === 'win32' ? resolveWindowsShellStartupFamily(status.terminalWindowsShell) : 'posix'
  }
}
