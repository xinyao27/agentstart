import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { projectCatalogTargetForRepo } from '~renderer/project-catalog/query'
import { invalidateProjectCatalogTarget } from '~renderer/project-catalog/refresh'
import { agentSessionQueryRoot } from '~renderer/runtime/agent-session/query'
import { targetKey } from '~renderer/runtime/query-target'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'
import { terminalQueryRoot } from '~renderer/runtime/terminal-query'
import { watchWorkspaceEvents } from '~renderer/runtime/workspace-events-target'
import { worktreeDetectedListQuery } from '~renderer/runtime/worktree-catalog-query'

import {
  terminalsQuery,
  worktreesQuery,
  workspaceEventsQuery,
  WORKSPACE_EVENTS_QUERY_ROOT
} from './queries'

const lastSeenByScope = new Map<string, number>()
const PROJECT_CATALOG_SCOPE = 'project-catalog'

export function WorkspaceEventBridge(): null {
  const { repos, runtimeEnvironments } = useProjectCatalog()
  const queryClient = useQueryClient()
  const scopes = [
    `local\t${PROJECT_CATALOG_SCOPE}`,
    ...runtimeEnvironments.map(
      (environment) => `environment:${environment.id}\t${PROJECT_CATALOG_SCOPE}`
    ),
    ...repos.map((repo) => `${targetKey(projectCatalogTargetForRepo(repo))}\t${repo.id}`)
  ]
    .sort()
    .join('\0')
  useEffect(() => {
    const controllers = scopes
      .split('\0')
      .filter(Boolean)
      .map(parseScopeEntry)
      .filter((entry) => entry !== null)
      .map(({ scope, target }) => {
        const controller = new AbortController()
        void consumeScope(target, scope, controller.signal, async () => {
          if (scope === PROJECT_CATALOG_SCOPE) {
            await invalidateProjectCatalogTarget(queryClient, target)
            return
          }
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: [...WORKSPACE_EVENTS_QUERY_ROOT, scope]
            }),
            queryClient.invalidateQueries({
              queryKey: worktreeDetectedListQuery(target, scope).queryKey
            }),
            queryClient.invalidateQueries({ queryKey: terminalQueryRoot(target) }),
            queryClient.invalidateQueries({ queryKey: agentSessionQueryRoot(target) }),
            ...(target.kind === 'local'
              ? [
                  queryClient.invalidateQueries({
                    queryKey: workspaceEventsQuery(scope).queryKey
                  }),
                  queryClient.invalidateQueries({ queryKey: worktreesQuery(scope).queryKey }),
                  queryClient.invalidateQueries({ queryKey: terminalsQuery.queryKey })
                ]
              : [])
          ])
        })
        return controller
      })
    return () => {
      for (const controller of controllers) {
        controller.abort()
      }
    }
  }, [queryClient, scopes])
  return null
}

async function consumeScope(
  target: RuntimeClientTarget,
  scope: string,
  signal: AbortSignal,
  invalidate: () => Promise<void>
): Promise<void> {
  const cursorKey = `${targetKey(target)}:${scope}`
  while (!signal.aborted) {
    try {
      // Why: the cursor is read on every attempt so a reopened watch resumes
      // after the last event this scope applied instead of replaying the tail.
      await watchWorkspaceEvents(
        target,
        { afterId: lastSeenByScope.get(cursorKey) ?? 0, scope },
        signal,
        async (event) => {
          await invalidate()
          // Why: a failed invalidation must replay this event on reconnect instead of advancing
          // the cursor and silently losing the state refresh it represented.
          lastSeenByScope.set(cursorKey, event.id)
        }
      )
    } catch {
      if (!signal.aborted) {
        await waitForRetry(signal)
      }
    }
  }
}

function parseScopeEntry(value: string): { scope: string; target: RuntimeClientTarget } | null {
  const separator = value.indexOf('\t')
  if (separator <= 0) {
    return null
  }
  const targetToken = value.slice(0, separator)
  const scope = value.slice(separator + 1)
  if (!scope) {
    return null
  }
  if (targetToken === 'local') {
    return { scope, target: { kind: 'local' } }
  }
  const prefix = 'environment:'
  return targetToken.startsWith(prefix) && targetToken.length > prefix.length
    ? {
        scope,
        target: { kind: 'environment', environmentId: targetToken.slice(prefix.length) }
      }
    : null
}

async function waitForRetry(signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    const onAbort = (): void => {
      window.clearTimeout(timeout)
      resolve()
    }
    const timeout = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, 1_500)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
