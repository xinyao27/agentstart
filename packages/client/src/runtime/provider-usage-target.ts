import { PROVIDER_USAGE_PROTOCOL_CAPABILITY, ProviderUsageClient } from '@agentstart/protocol'

import {
  openConfiguredBrowserHostProtocol,
  readConfiguredBrowserHostStatus
} from './browser-host-runtime'

export async function openProviderUsageTarget(
  provider: 'claude' | 'codex' | 'openCode'
): Promise<ProviderUsageClient | null> {
  const status = await readConfiguredBrowserHostStatus()
  if (!status.capabilities?.includes(PROVIDER_USAGE_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new ProviderUsageClient(await openConfiguredBrowserHostProtocol(), provider)
}
