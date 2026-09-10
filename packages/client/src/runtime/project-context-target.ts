import {
  ProjectContextClient,
  PROJECT_CONTEXT_PROTOCOL_CAPABILITY,
  type ProjectContextMatchValue
} from '@agentstart/protocol'
import { queryOptions } from '@tanstack/react-query'

import { openRuntimeProtocolTarget } from './protocol-target'
import { targetKey } from './query-target'
import { readRuntimeStatus } from './status-client'

export type { ProjectContextMatchValue }

export type ProjectContextResolveInput = Readonly<{
  canonicalKey: string
}>

// Why: the project context namespace is protobuf-only, so a missing capability
// means the connected daemon predates the cutover — an error, not a legacy
// retry.
async function resolveProjectContext(
  input: ProjectContextResolveInput
): Promise<{ matches: ProjectContextMatchValue[] }> {
  const target = { kind: 'local' } as const
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(PROJECT_CONTEXT_PROTOCOL_CAPABILITY)) {
    throw new Error('projectContext.protobuf.v1 capability is not available')
  }
  const client = new ProjectContextClient(await openRuntimeProtocolTarget(target))
  return client.resolve(input)
}

export function projectContextResolveQuery(input: ProjectContextResolveInput | null) {
  return queryOptions({
    queryKey: [
      'project-context',
      'resolve',
      targetKey({ kind: 'local' }),
      ...(input ? [input.canonicalKey] : [])
    ] as const,
    queryFn: () =>
      input
        ? resolveProjectContext(input)
        : Promise.resolve({ matches: [] as ProjectContextMatchValue[] })
  })
}
