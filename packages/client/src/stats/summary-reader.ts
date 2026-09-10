import { StatsClient } from '@agentstart/protocol'
import type { StatsSummaryInput } from '@agentstart/protocol/stats/client'
import type { StatsSummaryResult } from '@agentstart/protocol/stats/values'
import { readConfiguredBrowserHostStats } from '~renderer/runtime/browser-host-runtime'
import { openRuntimeProtocolTarget } from '~renderer/runtime/protocol-target'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'

import { mapProtocolStatsSummary } from './protocol-summary'

const STATS_SUMMARY_TIMEOUT_MS = 60_000

export function readStatsSummary(
  target: RuntimeClientTarget,
  input: StatsSummaryInput
): Promise<StatsSummaryResult> {
  if (target.kind === 'local') {
    // Why: a cold summary scans the local AI Vault before its short-lived cache is warm.
    return readConfiguredBrowserHostStats(input, STATS_SUMMARY_TIMEOUT_MS)
  }
  return readRemoteStatsSummary(target, input)
}

async function readRemoteStatsSummary(
  target: RuntimeClientTarget,
  input: StatsSummaryInput
): Promise<StatsSummaryResult> {
  const client = new StatsClient(await openRuntimeProtocolTarget(target))
  const summary = await client.getSummary(input, { timeoutMs: STATS_SUMMARY_TIMEOUT_MS })
  return mapProtocolStatsSummary(summary, input.range)
}
