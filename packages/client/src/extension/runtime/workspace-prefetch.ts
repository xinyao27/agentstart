import type { QueryClient } from '@tanstack/react-query'
import { agentSessionListQuery } from '~renderer/runtime/agent-session/query'

import { terminalsQuery, worktreesQuery, workspaceEventsQuery } from './queries'

export async function prefetchExtensionWorkspace(
  queryClient: QueryClient,
  projectId: string
): Promise<void> {
  await Promise.all([
    queryClient.prefetchQuery(worktreesQuery(projectId)),
    queryClient.prefetchQuery(workspaceEventsQuery(projectId)),
    queryClient.prefetchQuery(terminalsQuery),
    queryClient.prefetchQuery(agentSessionListQuery({ kind: 'local' }))
  ])
}
