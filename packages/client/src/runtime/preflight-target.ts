import {
  PREFLIGHT_PROTOCOL_CAPABILITY,
  PreflightClient,
  type PreflightAgentContextInput,
  type PreflightCheckInput,
  type PreflightDetectRemoteAgentsInput,
  type PreflightRefreshAgentsValue,
  type PreflightStatusValue,
  type RuntimeCallOptions
} from '@yiru/protocol'
import { translate } from '~renderer/i18n/i18n'

import { openRuntimeProtocolTarget } from './protocol-target'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

export async function openPreflightTarget(
  target: RuntimeClientTarget
): Promise<PreflightClient | null> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(PREFLIGHT_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new PreflightClient(await openRuntimeProtocolTarget(target))
}

// Why: the preflight namespace is protobuf-only, so a missing capability means
// the connected daemon predates the cutover — an error, not a legacy retry.
export async function requirePreflightClient(
  target: RuntimeClientTarget
): Promise<PreflightClient> {
  const client = await openPreflightTarget(target)
  if (!client) {
    throw new Error(
      translate(
        'runtime.preflightTarget.unavailable',
        'Agent detection needs a current Yiru daemon connection.'
      )
    )
  }
  return client
}

export async function preflightCheck(
  target: RuntimeClientTarget,
  input: PreflightCheckInput = {}
): Promise<PreflightStatusValue> {
  return (await requirePreflightClient(target)).check(input, callOptions(target))
}

export async function preflightDetectAgents(
  target: RuntimeClientTarget,
  input: PreflightAgentContextInput = {}
): Promise<string[]> {
  return (await requirePreflightClient(target)).detectAgents(input, callOptions(target))
}

export async function preflightDetectRemoteAgents(
  target: RuntimeClientTarget,
  input: PreflightDetectRemoteAgentsInput
): Promise<string[]> {
  return (await requirePreflightClient(target)).detectRemoteAgents(input, callOptions(target))
}

export async function preflightRefreshAgents(
  target: RuntimeClientTarget,
  input: PreflightAgentContextInput = {}
): Promise<PreflightRefreshAgentsValue> {
  return (await requirePreflightClient(target)).refreshAgents(input, callOptions(target))
}

function callOptions(target: RuntimeClientTarget): RuntimeCallOptions {
  // Why: Remote probes have a deadline because they include a runtime environment hop.
  return target.kind === 'environment' ? { timeoutMs: 15_000 } : {}
}
