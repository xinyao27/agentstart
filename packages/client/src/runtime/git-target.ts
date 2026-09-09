import { GIT_PROTOCOL_CAPABILITY, GitClient, runtimeEnvironmentTransport } from '@yiru/protocol'

import {
  openConfiguredBrowserHostProtocol,
  readConfiguredBrowserHostStatus
} from './browser-host-runtime'
import type { RuntimeClientTarget } from './rpc-client'

export async function openGitTarget(target: RuntimeClientTarget): Promise<GitClient | null> {
  const status = await readConfiguredBrowserHostStatus()
  if (!status.capabilities?.includes(GIT_PROTOCOL_CAPABILITY)) {
    return null
  }
  const transport = await openConfiguredBrowserHostProtocol()
  return new GitClient(
    target.kind === 'local'
      ? transport
      : runtimeEnvironmentTransport(transport, target.environmentId)
  )
}
