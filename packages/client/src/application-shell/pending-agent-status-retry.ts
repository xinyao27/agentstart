import type { AgentStatusIpcPayload } from '@agentstart/protocol/agent/status-records'

export type PendingAgentStatusEvent<T> = {
  data: T
  firstSeenAt: number
  replay: boolean
}

type AgentStatusApplyResult = 'applied' | 'pending' | 'dropped'

export function hasRuntimeBackedAgentStatusAttribution(
  data: Pick<AgentStatusIpcPayload, 'worktreeId' | 'terminalHandle' | 'orchestration'>
): data is Pick<AgentStatusIpcPayload, 'terminalHandle' | 'orchestration'> & {
  worktreeId: string
} {
  return Boolean(
    data.worktreeId &&
    ((typeof data.terminalHandle === 'string' && data.terminalHandle.length > 0) ||
      data.orchestration !== undefined)
  )
}

export function retryPendingAgentStatusEvents<T>(
  events: readonly PendingAgentStatusEvent<T>[],
  args: {
    now: number
    ttlMs: number
    apply: (data: T, options: { retry: true; replay: boolean }) => AgentStatusApplyResult
  }
): PendingAgentStatusEvent<T>[] {
  const remaining: PendingAgentStatusEvent<T>[] = []
  for (const event of events) {
    if (args.now - event.firstSeenAt > args.ttlMs) {
      continue
    }
    if (args.apply(event.data, { retry: true, replay: event.replay }) === 'pending') {
      remaining.push(event)
    }
  }
  return remaining
}
