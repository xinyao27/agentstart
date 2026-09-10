import { ORCHESTRATION_PROTOCOL_CAPABILITY, OrchestrationClient } from '@agentstart/protocol'

import {
  openConfiguredBrowserHostProtocol,
  readConfiguredBrowserHostStatus
} from './browser-host-runtime'

export async function openOrchestrationTarget(): Promise<OrchestrationClient | null> {
  const status = await readConfiguredBrowserHostStatus()
  if (!status.capabilities?.includes(ORCHESTRATION_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new OrchestrationClient(await openConfiguredBrowserHostProtocol())
}
