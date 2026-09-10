import {
  VisualRegressionClient,
  VISUAL_REGRESSION_PROTOCOL_CAPABILITY,
  type VisualRegressionCaptureValue,
  type VisualRegressionLatestResult,
  type VisualRegressionSaveInput
} from '@agentstart/protocol'
import { queryOptions } from '@tanstack/react-query'

import { openRuntimeProtocolTarget } from './protocol-target'
import { targetKey } from './query-target'
import { readRuntimeStatus } from './status-client'

export type { VisualRegressionCaptureValue }

export type VisualRegressionLatestInput = Readonly<{
  pageUrl: string
  projectId: string
  worktreeId: string
}>

// Why: the visual regression namespace is protobuf-only, so a missing
// capability means the connected daemon predates the cutover — an error, not a
// legacy retry.
async function requireVisualRegressionClient(): Promise<VisualRegressionClient> {
  const target = { kind: 'local' } as const
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(VISUAL_REGRESSION_PROTOCOL_CAPABILITY)) {
    throw new Error('visualRegression.protobuf.v1 capability is not available')
  }
  return new VisualRegressionClient(await openRuntimeProtocolTarget(target))
}

async function latestVisualRegression(
  input: VisualRegressionLatestInput
): Promise<VisualRegressionLatestResult> {
  return (await requireVisualRegressionClient()).latest(input)
}

export async function saveVisualRegression(
  input: VisualRegressionSaveInput
): Promise<{ capture: VisualRegressionCaptureValue }> {
  return (await requireVisualRegressionClient()).save(input)
}

export function visualRegressionLatestQuery(input: VisualRegressionLatestInput) {
  return queryOptions({
    queryKey: ['visual-regression', 'latest', targetKey({ kind: 'local' }), input] as const,
    queryFn: () => latestVisualRegression(input)
  })
}
