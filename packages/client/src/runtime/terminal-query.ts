import type { TerminalListInput } from '@agentstart/protocol'
import { queryOptions } from '@tanstack/react-query'

import { targetKey } from './query-target'
import type { RuntimeClientTarget } from './runtime-target'
import { openRuntimeTerminalClient } from './terminal-protocol'

export function terminalListQuery(
  target: RuntimeClientTarget,
  input: TerminalListInput,
  refetchInterval?: number
) {
  return queryOptions({
    queryKey: [...terminalQueryRoot(target), input] as const,
    queryFn: async () => (await openRuntimeTerminalClient(target)).list(input),
    ...(refetchInterval === undefined ? {} : { refetchInterval })
  })
}

export function terminalQueryRoot(target: RuntimeClientTarget) {
  return ['terminals', targetKey(target)] as const
}
