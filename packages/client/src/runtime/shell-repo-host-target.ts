import { SHELL_REPO_HOST_PROTOCOL_CAPABILITY, ShellRepoHostClient } from '@yiru/protocol'
import { translate } from '~renderer/i18n/i18n'

import {
  openConfiguredBrowserHostProtocol,
  readConfiguredBrowserHostStatus
} from './browser-host-runtime'

// Why: the shell repoHost namespace is protobuf-only, so a missing capability
// means the connected daemon predates the cutover — an error, not a legacy retry.
export async function requireShellRepoHostClient(): Promise<ShellRepoHostClient> {
  const status = await readConfiguredBrowserHostStatus()
  if (!status.capabilities?.includes(SHELL_REPO_HOST_PROTOCOL_CAPABILITY)) {
    throw new Error(
      translate(
        'runtime.shellRepoHostTarget.unavailable',
        'This action needs a current Yiru daemon connection.'
      )
    )
  }
  return new ShellRepoHostClient(await openConfiguredBrowserHostProtocol())
}
