import { COMPUTER_PROTOCOL_CAPABILITY, ComputerClient } from '@yiru/protocol'

import {
  openConfiguredBrowserHostProtocol,
  readConfiguredBrowserHostStatus
} from './browser-host-runtime'

export async function openComputerTarget(): Promise<ComputerClient | null> {
  const status = await readConfiguredBrowserHostStatus()
  if (!status.capabilities?.includes(COMPUTER_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new ComputerClient(await openConfiguredBrowserHostProtocol())
}
