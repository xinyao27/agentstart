import { EMULATOR_PROTOCOL_CAPABILITY, EmulatorClient } from '@yiru/protocol'
import { translate } from '~renderer/i18n/i18n'

import {
  openConfiguredBrowserHostProtocol,
  readConfiguredBrowserHostStatus
} from './browser-host-runtime'

export async function openEmulatorTarget(): Promise<EmulatorClient | null> {
  const status = await readConfiguredBrowserHostStatus()
  if (!status.capabilities?.includes(EMULATOR_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new EmulatorClient(await openConfiguredBrowserHostProtocol())
}

// Why: the emulator namespace is protobuf-only, so a missing capability means
// the connected daemon predates the cutover — an error, not a legacy retry.
export async function requireEmulatorClient(): Promise<EmulatorClient> {
  const client = await openEmulatorTarget()
  if (!client) {
    throw new Error(
      translate(
        'runtime.emulatorTarget.unavailable',
        'The emulator requires a current Yiru daemon connection.'
      )
    )
  }
  return client
}
