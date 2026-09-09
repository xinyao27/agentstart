import { queryOptions } from '@tanstack/react-query'
import { AgentSessionClient } from '@yiru/protocol/agent-session'
import { translate } from '~renderer/i18n/i18n'

import { openRuntimeProtocolTarget } from '../protocol-target'
import { targetKey } from '../query-target'
import type { RuntimeClientTarget } from '../rpc-client'

export function agentSessionQueryRoot(target: RuntimeClientTarget) {
  return ['agent-sessions', targetKey(target)] as const
}

export function agentSessionListQuery(
  target: RuntimeClientTarget,
  input: { worktreeId?: string } = {}
) {
  return queryOptions({
    queryKey: [...agentSessionQueryRoot(target), input] as const,
    queryFn: async ({ signal }) => (await agentSessionClient(target)).list(input, { signal }),
    staleTime: 2_000,
    refetchInterval: 2_000
  })
}

export async function followupAgentSession(
  target: RuntimeClientTarget,
  input: { sessionId: string; prompt: string }
): Promise<void> {
  const response = await (await agentSessionClient(target)).followup(input)
  if (!response.accepted) {
    throw new Error(
      translate(
        'runtime.agent.session.did.not.accept.the.followup',
        'Agent session did not accept the followup'
      )
    )
  }
}

async function agentSessionClient(target: RuntimeClientTarget): Promise<AgentSessionClient> {
  return new AgentSessionClient(await openRuntimeProtocolTarget(target))
}
