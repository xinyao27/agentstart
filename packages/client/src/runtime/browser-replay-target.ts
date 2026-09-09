import { BROWSER_REPLAY_PROTOCOL_CAPABILITY, BrowserReplayClient } from '@yiru/protocol'

import {
  openConfiguredBrowserHostProtocol,
  readConfiguredBrowserHostStatus
} from './browser-host-runtime'

export async function openBrowserReplayTarget(): Promise<BrowserReplayClient | null> {
  const status = await readConfiguredBrowserHostStatus()
  if (!status.capabilities?.includes(BROWSER_REPLAY_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new BrowserReplayClient(await openConfiguredBrowserHostProtocol())
}
