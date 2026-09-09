import { StatsClient } from '@yiru/protocol'
import type { StatsSummaryInput } from '@yiru/protocol/stats/client'
import type { StatsSummaryResult } from '@yiru/protocol/stats/values'
import { readConfiguredBrowserHostStats } from '~renderer/runtime/browser-host-runtime'
import { openRuntimeProtocolTarget } from '~renderer/runtime/protocol-target'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'

import { mapProtocolStatsSummary } from './protocol-summary'

export function readStatsSummary(
  target: RuntimeClientTarget,
  input: StatsSummaryInput
): Promise<StatsSummaryResult> {
  if (target.kind === 'local') {
    return readConfiguredBrowserHostStats(input)
  }
  return readRemoteStatsSummary(target, input)
}

async function readRemoteStatsSummary(
  target: RuntimeClientTarget,
  input: StatsSummaryInput
): Promise<StatsSummaryResult> {
  const client = new StatsClient(await openRuntimeProtocolTarget(target))
  const summary = await client.getSummary(input, { timeoutMs: 15_000 })
  return mapProtocolStatsSummary(summary, input.range)
}
