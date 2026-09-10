import { SKILLS_PROTOCOL_CAPABILITY, SkillsClient } from '@agentstart/protocol'
import { translate } from '~renderer/i18n/i18n'

import { openRuntimeProtocolTarget } from './protocol-target'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

async function openSkillsProtocolTarget(target: RuntimeClientTarget): Promise<SkillsClient | null> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(SKILLS_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new SkillsClient(await openRuntimeProtocolTarget(target))
}

// Why: the skills namespace is protobuf-only, so a missing capability means the
// connected daemon predates the cutover — an error, not a legacy retry.
export async function requireSkillsProtocolClient(
  target: RuntimeClientTarget
): Promise<SkillsClient> {
  const client = await openSkillsProtocolTarget(target)
  if (!client) {
    throw new Error(
      translate(
        'runtime.skillsProtocolTarget.unavailable',
        'Skill management needs a current AgentStart daemon connection.'
      )
    )
  }
  return client
}
