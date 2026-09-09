import { SESSION_TABS_PROTOCOL_CAPABILITY, SessionTabsClient } from '@yiru/protocol'
import { translate } from '~renderer/i18n/i18n'

import { openRuntimeProtocolTarget } from './protocol-target'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

export async function openSessionTabsProtocolTarget(
  target: RuntimeClientTarget
): Promise<SessionTabsClient | null> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(SESSION_TABS_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new SessionTabsClient(await openRuntimeProtocolTarget(target))
}

// Why: session tabs are protobuf-only, so a missing capability means the
// connected daemon predates the cutover — an error, not a legacy retry.
export async function requireSessionTabsClient(
  target: RuntimeClientTarget
): Promise<SessionTabsClient> {
  const client = await openSessionTabsProtocolTarget(target)
  if (!client) {
    throw new Error(
      translate(
        'runtime.sessionTabsTarget.unavailable',
        'This action needs a current Yiru daemon connection.'
      )
    )
  }
  return client
}
