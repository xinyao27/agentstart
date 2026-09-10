import { WindowsFirewallClient } from '@agentstart/protocol'

import { openConfiguredBrowserHostProtocol } from './browser-host-runtime'

export async function openWindowsFirewallTarget(): Promise<WindowsFirewallClient> {
  return new WindowsFirewallClient(await openConfiguredBrowserHostProtocol())
}
