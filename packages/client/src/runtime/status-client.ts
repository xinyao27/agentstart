import { StatusClient } from '@agentstart/protocol'
import type { RuntimeStatusResult } from '~renderer/runtime/status/model'

import { readConfiguredBrowserHostStatus } from './browser-host-runtime'
import { openRuntimeProtocolTarget } from './protocol-target'
import type { RuntimeClientTarget } from './runtime-target'
import { mapProtocolStatus } from './status-mapping'

export function readRuntimeStatus(
  target: RuntimeClientTarget,
  timeoutMs?: number
): Promise<RuntimeStatusResult> {
  if (target.kind === 'local') {
    return readConfiguredBrowserHostStatus(timeoutMs)
  }
  return readRemoteRuntimeStatus(target, timeoutMs)
}

async function readRemoteRuntimeStatus(
  target: RuntimeClientTarget,
  timeoutMs?: number
): Promise<RuntimeStatusResult> {
  const client = new StatusClient(await openRuntimeProtocolTarget(target))
  return mapProtocolStatus(await client.get({ timeoutMs: timeoutMs ?? 15_000 }))
}
