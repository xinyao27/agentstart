import type { QueryClient } from '@tanstack/react-query'
import { readProjectCatalogSnapshot } from '~renderer/project-catalog/catalog-snapshot'
import { projectCatalogTargetForRepo } from '~renderer/project-catalog/query'
import {
  refreshProjectCatalogTargetRepos,
  refreshProjectCatalogWorktrees
} from '~renderer/project-catalog/refresh'
import type { RuntimeClientEvent } from '~renderer/runtime/client-event-model'
import { subscribeRuntimeClientEvents } from '~renderer/runtime/client-events'
import { targetKey } from '~renderer/runtime/query-target'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'
import { useAppStore } from '~renderer/store/state'
import { activateAndRevealKnownWorktree } from '~renderer/worktree/activation'

import { createRuntimeClientEventsSync } from '../runtime-client-events-sync'

export function isRuntimeEnvironmentActive(): boolean {
  return Boolean(useAppStore.getState().settings?.activeRuntimeEnvironmentId?.trim())
}

function getRuntimeClientEventEnvironmentIds(): string[] {
  const state = useAppStore.getState()
  const ids = new Set<string>()
  const activeEnvironmentId = state.settings?.activeRuntimeEnvironmentId?.trim()
  if (activeEnvironmentId) {
    ids.add(activeEnvironmentId)
  }
  for (const environment of readProjectCatalogSnapshot().runtimeEnvironments) {
    if (state.runtimeStatusByEnvironmentId?.get(environment.id)?.status) {
      ids.add(environment.id)
    }
  }
  return [...ids]
}

function environmentKey(environmentIds: readonly string[]): string {
  return [...new Set(environmentIds)].sort().join('\u0000')
}

async function resolveEventRepo(
  queryClient: QueryClient,
  target: RuntimeClientTarget,
  repoId: string
) {
  const expectedTargetKey = targetKey(target)
  const matches = (repo: ReturnType<typeof readProjectCatalogSnapshot>['repos'][number]) =>
    repo.id === repoId && targetKey(projectCatalogTargetForRepo(repo)) === expectedTargetKey
  return (
    readProjectCatalogSnapshot().repos.find(matches) ??
    (await refreshProjectCatalogTargetRepos(queryClient, target)).find(matches)
  )
}

async function activateNotifiedWorktree(
  queryClient: QueryClient,
  environmentId: string,
  event: Extract<RuntimeClientEvent, { type: 'activateWorktree' }>
): Promise<void> {
  const target = { kind: 'environment', environmentId } as const
  const repo = await resolveEventRepo(queryClient, target, event.repoId)
  if (!repo) {
    return
  }
  const refreshed = await refreshProjectCatalogWorktrees(queryClient, repo)
  const worktree = refreshed.detected?.worktrees.find(
    (candidate) => candidate.id === event.worktreeId
  )
  if (!worktree) {
    return
  }
  activateAndRevealKnownWorktree(worktree, {
    ...(event.setup ? { setup: event.setup } : {}),
    ...(event.startup ? { startup: event.startup } : {}),
    ...(event.defaultTabs ? { defaultTabs: event.defaultTabs } : {}),
    sidebarRevealBehavior: 'auto',
    notifyHostRuntime: false
  })
}

export function subscribeRuntimeProjectEvents(queryClient: QueryClient): () => void {
  const eventSync = createRuntimeClientEventsSync({
    getDesiredEnvironmentIds: getRuntimeClientEventEnvironmentIds,
    subscribe: (environmentId, onEvent, onError) =>
      subscribeRuntimeClientEvents(environmentId, onEvent, onError),
    onEvent: (environmentId, event) => {
      if (event.type !== 'activateWorktree') {
        return
      }
      void activateNotifiedWorktree(queryClient, environmentId, event).catch((error) =>
        console.error('Failed to activate runtime-created worktree:', error)
      )
    }
  })

  eventSync.sync()
  let desiredKey = environmentKey(getRuntimeClientEventEnvironmentIds())
  const unsubscribeStore = useAppStore.subscribe(() => {
    const nextDesiredKey = environmentKey(getRuntimeClientEventEnvironmentIds())
    if (nextDesiredKey === desiredKey) {
      return
    }
    desiredKey = nextDesiredKey
    eventSync.sync()
  })

  return () => {
    unsubscribeStore()
    eventSync.stop()
  }
}
