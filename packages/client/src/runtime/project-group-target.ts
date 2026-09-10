import { PROJECT_GROUP_PROTOCOL_CAPABILITY, ProjectGroupClient } from '@agentstart/protocol'
import { translate } from '~renderer/i18n/i18n'

import { openRuntimeProtocolTarget } from './protocol-target'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

async function openProjectGroupProtocolTarget(
  target: RuntimeClientTarget
): Promise<ProjectGroupClient | null> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(PROJECT_GROUP_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new ProjectGroupClient(await openRuntimeProtocolTarget(target))
}

// Why: the project group namespace is protobuf-only, so a missing capability
// means the connected daemon predates the cutover — an error, not a legacy retry.
export async function requireProjectGroupProtocolClient(
  target: RuntimeClientTarget
): Promise<ProjectGroupClient> {
  const client = await openProjectGroupProtocolTarget(target)
  if (!client) {
    throw new Error(
      translate(
        'runtime.projectGroupTarget.unavailable',
        'This action needs a current AgentStart daemon connection.'
      )
    )
  }
  return client
}

export async function listRuntimeProjectGroups(target: RuntimeClientTarget) {
  return (await requireProjectGroupProtocolClient(target)).list({ timeoutMs: 15_000 })
}
