import {
  CLI_PROTOCOL_CAPABILITY,
  CLI_WSL_PROTOCOL_CAPABILITY,
  CliClient,
  runtimeEnvironmentTransport,
  type CliInstallStatus
} from '@agentstart/protocol'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'

import { openConfiguredBrowserHostProtocol } from './browser-host-runtime'
import { getActiveRuntimeTarget } from './rpc-client'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

type RuntimeSettings = Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined

// Why: installing the launcher can shell out to a package manager and rewrite
// shell profiles, which comfortably outruns the default call timeout.
const CLI_INSTALL_TIMEOUT_MS = 120_000

export async function readCliInstallStatus(settings?: RuntimeSettings): Promise<CliInstallStatus> {
  return withCliClient(getActiveRuntimeTarget(settings), CLI_PROTOCOL_CAPABILITY, (client) =>
    client.getInstallStatus()
  )
}

export async function installCliCommand(settings?: RuntimeSettings): Promise<CliInstallStatus> {
  return withCliClient(getActiveRuntimeTarget(settings), CLI_PROTOCOL_CAPABILITY, (client) =>
    client.install({ timeoutMs: CLI_INSTALL_TIMEOUT_MS })
  )
}

export async function removeCliCommand(settings?: RuntimeSettings): Promise<CliInstallStatus> {
  return withCliClient(getActiveRuntimeTarget(settings), CLI_PROTOCOL_CAPABILITY, (client) =>
    client.remove({ timeoutMs: CLI_INSTALL_TIMEOUT_MS })
  )
}

export async function readWslCliInstallStatus(
  args?: { distro?: string | null },
  settings?: RuntimeSettings
): Promise<CliInstallStatus> {
  return withCliClient(getActiveRuntimeTarget(settings), CLI_WSL_PROTOCOL_CAPABILITY, (client) =>
    client.getWslInstallStatus(args)
  )
}

export async function installWslCliCommand(
  args?: { distro?: string | null },
  settings?: RuntimeSettings
): Promise<CliInstallStatus> {
  return withCliClient(getActiveRuntimeTarget(settings), CLI_WSL_PROTOCOL_CAPABILITY, (client) =>
    client.installWsl(args, { timeoutMs: CLI_INSTALL_TIMEOUT_MS })
  )
}

export async function removeWslCliCommand(
  args?: { distro?: string | null },
  settings?: RuntimeSettings
): Promise<CliInstallStatus> {
  return withCliClient(getActiveRuntimeTarget(settings), CLI_WSL_PROTOCOL_CAPABILITY, (client) =>
    client.removeWsl(args, { timeoutMs: CLI_INSTALL_TIMEOUT_MS })
  )
}

async function withCliClient(
  target: RuntimeClientTarget,
  capability: string,
  call: (client: CliClient) => Promise<CliInstallStatus>
): Promise<CliInstallStatus> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(capability)) {
    throw new Error(`${capability} capability is not available on this runtime host`)
  }
  const transport = await openConfiguredBrowserHostProtocol()
  const client =
    target.kind === 'local'
      ? new CliClient(transport)
      : new CliClient(runtimeEnvironmentTransport(transport, target.environmentId))
  return call(client)
}
