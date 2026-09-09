import { SHELL_YIRU_PROFILES_PROTOCOL_CAPABILITY, ShellYiruProfilesClient } from '@yiru/protocol'
import { translate } from '~renderer/i18n/i18n'

import {
  openConfiguredBrowserHostProtocol,
  readConfiguredBrowserHostStatus
} from './browser-host-runtime'

export async function openShellYiruProfilesTarget(): Promise<ShellYiruProfilesClient | null> {
  const status = await readConfiguredBrowserHostStatus()
  if (!status.capabilities?.includes(SHELL_YIRU_PROFILES_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new ShellYiruProfilesClient(await openConfiguredBrowserHostProtocol())
}

// Why: the yiruProfiles namespace is protobuf-only and local-only — profiles
// select this installation's user data directory and relaunch this binary —
// so a missing capability means the connected daemon predates the cutover.
export async function requireShellYiruProfilesClient(): Promise<ShellYiruProfilesClient> {
  const client = await openShellYiruProfilesTarget()
  if (!client) {
    throw new Error(
      translate(
        'runtime.shellYiruProfilesTarget.unavailable',
        'Profiles need a current Yiru daemon connection.'
      )
    )
  }
  return client
}
