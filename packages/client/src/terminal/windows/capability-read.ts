import { openHostRegistryTarget } from '~renderer/runtime/host-registry-target'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'
import { readRuntimeStatus } from '~renderer/runtime/status-client'

import type { WindowsTerminalCapabilities } from './capabilities'

export type WindowsTerminalCapabilityLoadTarget = RuntimeClientTarget

export async function readWindowsTerminalCapabilities(
  target: WindowsTerminalCapabilityLoadTarget,
  sshConnectionId?: string | null
): Promise<WindowsTerminalCapabilities> {
  // Why: probing a remote host's shells has no transport left. Report nothing
  // available rather than answering with this machine's shells, which would let
  // the terminal pick a WSL/Git Bash launcher that does not exist over there.
  if (sshConnectionId) {
    return unavailableCapabilities()
  }

  const client = await openHostRegistryTarget(target)
  if (!client) {
    return unavailableCapabilities()
  }

  // Why: each probe degrades independently so one failed shell probe cannot
  // blank the launcher picker the way a rejected Promise.all would.
  const [wslAvailable, wslDistros, pwshAvailable, gitBashAvailable, hostPlatform] =
    await Promise.all([
      client.isWslAvailable({ timeoutMs: 15_000 }).catch(() => false),
      client.listWslDistros({ timeoutMs: 15_000 }).catch(() => []),
      client.isPwshAvailable({ timeoutMs: 15_000 }).catch(() => false),
      client.isGitBashAvailable({ timeoutMs: 15_000 }).catch(() => false),
      readRuntimeStatus(target, 15_000)
        .then((status) => status.hostPlatform ?? null)
        .catch(() => null)
    ])
  return {
    wslAvailable,
    wslDistros,
    pwshAvailable,
    gitBashAvailable,
    hostPlatform,
    isLoading: false
  }
}

function unavailableCapabilities(): WindowsTerminalCapabilities {
  return {
    wslAvailable: false,
    wslDistros: [],
    pwshAvailable: false,
    gitBashAvailable: false,
    hostPlatform: null,
    isLoading: false
  }
}
