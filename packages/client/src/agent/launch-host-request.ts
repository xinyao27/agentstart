import { parseWorkspaceKey } from '@yiru/protocol/workspace/identity'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { readProjectCatalogSnapshot } from '~renderer/project-catalog/catalog-snapshot'
import { readRuntimeStatus } from '~renderer/runtime/status-client'
import { useAppStore } from '~renderer/store/state'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

import { resolveRemoteAgentLaunchHost, type AgentLaunchHost } from './launch-host'

const pendingLaunchRequests = new Map<string, symbol>()

export async function requestRemoteAgentLaunchHost(
  worktreeId: string,
  environmentId: string
): Promise<AgentLaunchHost | null> {
  const request = Symbol()
  const initialActiveWorktreeId = useAppStore.getState().activeWorktreeId
  const initialRuntimeId = readProjectCatalogSnapshot().runtimeEnvironments.find(
    (environment) => environment.id === environmentId
  )?.runtimeId
  let abandoned = false
  const unsubscribe = useAppStore.subscribe((state) => {
    if (state.activeWorktreeId !== initialActiveWorktreeId) {
      abandoned = true
    }
  })
  pendingLaunchRequests.set(worktreeId, request)
  try {
    const status = await readRuntimeStatus({ kind: 'environment', environmentId })
    const state = useAppStore.getState()
    const scope = parseWorkspaceKey(worktreeId)
    const exists =
      scope?.type === 'folder'
        ? state.folderWorkspaces.some((folder) => folder.id === scope.folderWorkspaceId)
        : state.allWorktrees().some((worktree) => worktree.id === worktreeId)
    const runtimeId = readProjectCatalogSnapshot().runtimeEnvironments.find(
      (environment) => environment.id === environmentId
    )?.runtimeId
    if (
      abandoned ||
      !exists ||
      pendingLaunchRequests.get(worktreeId) !== request ||
      getRuntimeEnvironmentIdForWorktree(state, worktreeId) !== environmentId ||
      runtimeId !== initialRuntimeId ||
      (runtimeId && runtimeId !== status.runtimeId)
    ) {
      return null
    }
    const host = resolveRemoteAgentLaunchHost(status)
    if (!host) {
      throw new Error(
        translate(
          'agent.launch.platformUnavailable',
          'The runtime did not report its terminal platform.'
        )
      )
    }
    return host
  } catch (error) {
    if (!abandoned && pendingLaunchRequests.get(worktreeId) === request) {
      toast.error(
        translate(
          'agent.launch.runtimeUnavailable',
          'Could not prepare the agent on its runtime host.'
        ),
        {
          description: error instanceof Error ? error.message : undefined
        }
      )
    }
    return null
  } finally {
    unsubscribe()
    if (pendingLaunchRequests.get(worktreeId) === request) {
      pendingLaunchRequests.delete(worktreeId)
    }
  }
}
