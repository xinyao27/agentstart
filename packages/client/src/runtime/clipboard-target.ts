import { CLIPBOARD_PROTOCOL_CAPABILITY, ClipboardClient } from '@agentstart/protocol'
import { translate } from '~renderer/i18n/i18n'

import { openRuntimeProtocolTarget } from './protocol-target'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

async function openClipboardTarget(target: RuntimeClientTarget): Promise<ClipboardClient | null> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(CLIPBOARD_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new ClipboardClient(await openRuntimeProtocolTarget(target))
}

// Why: the clipboard namespace is protobuf-only, so a missing capability means
// the connected daemon predates the cutover — an error, not a legacy retry.
export async function requireClipboardClient(
  target: RuntimeClientTarget
): Promise<ClipboardClient> {
  const client = await openClipboardTarget(target)
  if (!client) {
    throw new Error(
      translate(
        'runtime.clipboardTarget.unavailable',
        'Saving the clipboard image needs a current AgentStart daemon connection.'
      )
    )
  }
  return client
}
