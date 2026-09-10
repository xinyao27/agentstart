import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type { PersistedUIState } from '@agentstart/protocol/settings/ui-state'
import type { FeatureInteractionId } from '@agentstart/protocol/telemetry/interactions/catalog'

import { getActiveRuntimeTarget } from './rpc-client'
import { requireUiClient } from './ui-target'

type RuntimeEnvironmentSettings =
  | Pick<GlobalSettings, 'activeRuntimeEnvironmentId'>
  | null
  | undefined

export async function getRuntimeUIState(
  settings: RuntimeEnvironmentSettings
): Promise<PersistedUIState> {
  // Why: the persisted UI document is open-ended JSON on both sides; the
  // renderer's closed projection reads only keys it knows.
  const document = await (await requireUiClient(getActiveRuntimeTarget(settings))).get()
  return document as PersistedUIState
}

export async function setRuntimeUIState(
  settings: RuntimeEnvironmentSettings,
  updates: Partial<PersistedUIState>
): Promise<void> {
  await (await requireUiClient(getActiveRuntimeTarget(settings))).set({ ...updates })
}

export async function recordRuntimeUIFeatureInteraction(
  settings: RuntimeEnvironmentSettings,
  id: FeatureInteractionId
): Promise<PersistedUIState> {
  const client = await requireUiClient(getActiveRuntimeTarget(settings))
  const document = await client.recordFeatureInteraction(id)
  return document as PersistedUIState
}
