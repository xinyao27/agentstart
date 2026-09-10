import {
  SETTINGS_DOCUMENT_PROTOCOL_CAPABILITY,
  SETTINGS_PROTOCOL_CAPABILITY,
  SettingsClient
} from '@agentstart/protocol'
import { translate } from '~renderer/i18n/i18n'

import { openRuntimeProtocolTarget } from './protocol-target'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

async function openSettingsProtocolTarget(
  target: RuntimeClientTarget
): Promise<SettingsClient | null> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(SETTINGS_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new SettingsClient(await openRuntimeProtocolTarget(target))
}

// Why: the full-document verbs ride their own capability so a daemon with the
// snapshot service but no GetDocument/SetDocument stays a hard error here.
export async function openSettingsDocumentTarget(
  target: RuntimeClientTarget
): Promise<SettingsClient | null> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(SETTINGS_DOCUMENT_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new SettingsClient(await openRuntimeProtocolTarget(target))
}

// Why: the settings namespace is protobuf-only, so a missing capability means
// the connected daemon predates the cutover — an error, not a legacy retry.
export async function requireSettingsProtocolClient(
  target: RuntimeClientTarget
): Promise<SettingsClient> {
  const client = await openSettingsProtocolTarget(target)
  if (!client) {
    throw new Error(
      translate(
        'runtime.settingsProtocolTarget.unavailable',
        'This action needs a current AgentStart daemon connection.'
      )
    )
  }
  return client
}
