import { UI_PROTOCOL_CAPABILITY, UiClient } from '@agentstart/protocol'
import { translate } from '~renderer/i18n/i18n'

import { openRuntimeProtocolTarget } from './protocol-target'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

async function openUiTarget(target: RuntimeClientTarget): Promise<UiClient | null> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(UI_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new UiClient(await openRuntimeProtocolTarget(target))
}

// Why: the ui namespace is protobuf-only, so a missing capability means the
// connected daemon predates the cutover — an error, not a legacy retry.
export async function requireUiClient(target: RuntimeClientTarget): Promise<UiClient> {
  const client = await openUiTarget(target)
  if (!client) {
    throw new Error(
      translate(
        'runtime.uiTarget.unavailable',
        'This action needs a current AgentStart daemon connection.'
      )
    )
  }
  return client
}
