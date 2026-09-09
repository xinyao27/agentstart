import { AGENT_STATUS_PROTOCOL_CAPABILITY, AgentStatusClient } from '@yiru/protocol'
import { translate } from '~renderer/i18n/i18n'

import {
  openConfiguredBrowserHostProtocol,
  readConfiguredBrowserHostStatus
} from './browser-host-runtime'

// Why: every PTY host funnels hooks back to the shell runtime's one agent-status
// authority. On web, the local adapter intentionally resolves to the paired host.
export async function openAgentStatusProtocolClient(): Promise<AgentStatusClient | null> {
  const status = await readConfiguredBrowserHostStatus()
  if (!status.capabilities?.includes(AGENT_STATUS_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new AgentStatusClient(await openConfiguredBrowserHostProtocol())
}

// Why: agent status is protobuf-only, so a missing capability means the
// connected daemon predates the cutover — an error, not a legacy retry.
export async function requireAgentStatusClient(): Promise<AgentStatusClient> {
  const client = await openAgentStatusProtocolClient()
  if (!client) {
    throw new Error(
      translate(
        'runtime.agentStatusTarget.unavailable',
        'This action needs a current Yiru daemon connection.'
      )
    )
  }
  return client
}
