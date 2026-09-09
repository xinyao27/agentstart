import { subscribeGitHubPrRefreshEvents } from '~renderer/runtime/github-events-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import { useAppStore } from '~renderer/store/state'

import { isRuntimeEnvironmentActive, subscribeRuntimeProjectEvents } from './runtime-projects'

export function subscribeWorkspaceEvents(queryClient: QueryClient): () => void {
  const unsubs = [subscribeRuntimeProjectEvents(queryClient)]

  unsubs.push(
    workspaceHostClient.worktrees.onBaseStatus((event) => {
      if (!isRuntimeEnvironmentActive()) {
        useAppStore.getState().updateWorktreeBaseStatus(event)
      }
    }),
    workspaceHostClient.worktrees.onCreateProgress?.((data) => {
      if (data.operationId) {
        useAppStore.getState().updatePendingWorktreeCreation(data.operationId, {
          copiedFileCount: data.copiedFileCount,
          phase: data.phase,
          setupConfigured: data.setupConfigured
        })
      }
    }) ?? (() => {}),
    subscribeGitHubPrRefreshEvents((event) => {
      useAppStore.getState().applyGitHubPRRefreshEvent(event)
    })
  )

  return () => unsubs.forEach((unsubscribe) => unsubscribe())
}
import type { QueryClient } from '@tanstack/react-query'
