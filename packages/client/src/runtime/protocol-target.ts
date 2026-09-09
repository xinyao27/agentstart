import { runtimeEnvironmentTransport, type RuntimeTransport } from '@yiru/protocol'

import { openConfiguredBrowserHostProtocol } from './browser-host-runtime'
import type { RuntimeClientTarget } from './rpc-client'

export async function openRuntimeProtocolTarget(
  target: RuntimeClientTarget
): Promise<RuntimeTransport> {
  const transport = await openConfiguredBrowserHostProtocol()
  return target.kind === 'local'
    ? transport
    : runtimeEnvironmentTransport(transport, target.environmentId)
}
