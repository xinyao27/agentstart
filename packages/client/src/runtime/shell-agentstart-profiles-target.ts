import {
  SHELL_AGENT_START_PROFILES_PROTOCOL_CAPABILITY,
  ShellAgentStartProfilesClient
} from '@agentstart/protocol'
import { translate } from '~renderer/i18n/i18n'

import {
  openConfiguredBrowserHostProtocol,
  readConfiguredBrowserHostStatus
} from './browser-host-runtime'

async function openShellAgentStartProfilesTarget(): Promise<ShellAgentStartProfilesClient | null> {
  const status = await readConfiguredBrowserHostStatus()
  if (!status.capabilities?.includes(SHELL_AGENT_START_PROFILES_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new ShellAgentStartProfilesClient(await openConfiguredBrowserHostProtocol())
}

// Why: the agentstartProfiles namespace is protobuf-only and local-only — profiles
// select this installation's user data directory and relaunch this binary —
// so a missing capability means the connected daemon predates the cutover.
export async function requireShellAgentStartProfilesClient(): Promise<ShellAgentStartProfilesClient> {
  const client = await openShellAgentStartProfilesTarget()
  if (!client) {
    throw new Error(
      translate(
        'runtime.shellAgentStartProfilesTarget.unavailable',
        'Profiles need a current AgentStart daemon connection.'
      )
    )
  }
  return client
}
