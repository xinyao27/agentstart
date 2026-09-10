import { BROWSER_WRITEBACK_PROTOCOL_CAPABILITY, BrowserWritebackClient } from '@agentstart/protocol'

import {
  openConfiguredBrowserHostProtocol,
  readConfiguredBrowserHostStatus
} from './browser-host-runtime'

export async function openBrowserWritebackTarget(): Promise<BrowserWritebackClient | null> {
  const status = await readConfiguredBrowserHostStatus()
  if (!status.capabilities?.includes(BROWSER_WRITEBACK_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new BrowserWritebackClient(await openConfiguredBrowserHostProtocol())
}
