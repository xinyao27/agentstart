import { MobilePairingClient } from '@agentstart/protocol'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'

import { openRuntimeProtocolTarget } from './protocol-target'

type RuntimeSettings = Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined

async function pairingClient(_settings?: RuntimeSettings): Promise<MobilePairingClient> {
  // Why: pairing mints a device credential on the daemon accepting the phone's connection,
  // so changing the selected work host must never redirect this authority.
  return new MobilePairingClient(await openRuntimeProtocolTarget({ kind: 'local' }))
}

export async function listMobileNetworkInterfaces(settings?: RuntimeSettings) {
  const client = await pairingClient(settings)
  return { interfaces: [...(await client.listNetworkInterfaces())] }
}

export async function getMobilePairingQR(
  args: { address?: string; rotate?: boolean },
  settings?: RuntimeSettings
) {
  const client = await pairingClient(settings)
  return client.getPairingQr(args)
}

export async function listPairedMobileDevices(settings?: RuntimeSettings) {
  const client = await pairingClient(settings)
  return { devices: [...(await client.listDevices())] }
}

export async function revokePairedMobileDevice(
  args: { deviceId: string },
  settings?: RuntimeSettings
) {
  const client = await pairingClient(settings)
  return { revoked: await client.revokeDevice(args.deviceId) }
}
