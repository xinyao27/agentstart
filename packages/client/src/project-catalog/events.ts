import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { subscribeRuntimeClientEvents } from '~renderer/runtime/client-events'
import { repoHostClient } from '~renderer/runtime/repo-host-client'
import {
  RUNTIME_ENVIRONMENTS_QUERY_KEY,
  runtimeEnvironmentsClient
} from '~renderer/runtime/runtime-environments-client'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'
import { worktreeHostClient } from '~renderer/runtime/worktree-host-client'

import { invalidateProjectCatalogTarget } from './refresh'
import { createProjectCatalogWorktreeEvents } from './worktree-events'

const LOCAL_TARGET = { kind: 'local' } as const satisfies RuntimeClientTarget

export function useProjectCatalogEvents(): void {
  const queryClient = useQueryClient()
  const environments = useQuery({
    queryKey: RUNTIME_ENVIRONMENTS_QUERY_KEY,
    queryFn: () => runtimeEnvironmentsClient.list(),
    staleTime: 30_000
  })
  const environmentKey = (environments.data ?? [])
    .map((environment) => environment.id)
    .sort()
    .join('\0')

  useEffect(() => {
    const worktreeChanges = createProjectCatalogWorktreeEvents(queryClient)
    const unsubscribeRepos = repoHostClient.onChanged(() => {
      void invalidateProjectCatalogTarget(queryClient, LOCAL_TARGET)
    })
    const unsubscribeWorktrees = worktreeHostClient.onChanged(({ repoId }) => {
      worktreeChanges.enqueue({ repoId, target: LOCAL_TARGET })
    })
    const unsubscribeHeads = worktreeHostClient.onHeadIdentitiesChanged?.(({ repoId }) => {
      worktreeChanges.enqueue({ repoId, target: LOCAL_TARGET })
    })
    const subscriptions = new Set<() => void>()
    let isDisposed = false
    for (const environmentId of environmentKey.split('\0').filter(Boolean)) {
      void subscribeRuntimeClientEvents(environmentId, (event) => {
        if (event.type === 'reposChanged') {
          void invalidateProjectCatalogTarget(queryClient, {
            kind: 'environment',
            environmentId
          })
          return
        }
        worktreeChanges.enqueue({
          repoId: event.repoId,
          target: { kind: 'environment', environmentId },
          ...(event.type === 'worktreesChanged' && event.renamed ? { renamed: event.renamed } : {})
        })
      }).then((subscription) => {
        if (isDisposed) {
          subscription.unsubscribe()
          return
        }
        subscriptions.add(subscription.unsubscribe)
      })
    }
    return () => {
      isDisposed = true
      worktreeChanges.dispose()
      unsubscribeRepos()
      unsubscribeWorktrees()
      unsubscribeHeads?.()
      for (const unsubscribe of subscriptions) {
        unsubscribe()
      }
    }
  }, [environmentKey, queryClient])
}
