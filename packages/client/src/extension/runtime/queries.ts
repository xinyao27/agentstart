import { queryOptions, skipToken } from '@tanstack/react-query'
import type { FileListResult } from '@yiru/protocol'
import { projectCatalogRepoQuery } from '~renderer/project-catalog/repo-query'
import { openFilesTarget } from '~renderer/runtime/files-target'
import { targetKey } from '~renderer/runtime/query-target'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'
import { terminalListQuery } from '~renderer/runtime/terminal-query'
import { requireWorkspaceEventsClient } from '~renderer/runtime/workspace-events-target'
import { listRuntimeWorktrees } from '~renderer/runtime/worktree-lifecycle-target'

const LOCAL_TARGET = { kind: 'local' } as const satisfies RuntimeClientTarget

export const WORKSPACE_EVENTS_QUERY_ROOT = ['extension-workspace-events'] as const

export const projectsQuery = projectCatalogRepoQuery(LOCAL_TARGET)

export function worktreesQuery(projectId: string) {
  return queryOptions({
    queryKey: ['extension-worktrees', projectId] as const,
    queryFn: () => listRuntimeWorktrees(LOCAL_TARGET, { repo: projectId, limit: 500 })
  })
}

export const terminalsQuery = terminalListQuery(LOCAL_TARGET, { limit: 500 }, 2_000)

export function filePathsQuery(
  target: RuntimeClientTarget | null,
  worktreeId: string | null,
  query: string
) {
  const activeTarget = target ?? LOCAL_TARGET
  const normalizedQuery = query.trim()
  const enabled = worktreeId !== null && normalizedQuery.length > 0
  return queryOptions({
    queryKey: [
      'extension-file-paths',
      targetKey(activeTarget),
      worktreeId,
      normalizedQuery
    ] as const,
    queryFn: enabled
      ? async (): Promise<FileListResult> => {
          const client = await openFilesTarget(activeTarget)
          if (!client) {
            throw new Error('files.protobuf.v1 capability is not available on this runtime host')
          }
          return client.searchPaths({
            worktree: worktreeId ?? '',
            query: normalizedQuery,
            limit: 32
          })
        }
      : skipToken,
    staleTime: 10_000
  })
}

export function workspaceEventsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...WORKSPACE_EVENTS_QUERY_ROOT, projectId] as const,
    queryFn: async () => {
      const client = await requireWorkspaceEventsClient(LOCAL_TARGET)
      return client.list({ limit: 500, scope: projectId })
    }
  })
}
