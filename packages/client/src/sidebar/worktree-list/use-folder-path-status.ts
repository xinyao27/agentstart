import type { ProjectGroup } from '@agentstart/protocol/project/group-model'
import type { Repo } from '@agentstart/protocol/project/repository'
import type { FolderWorkspace } from '@agentstart/protocol/workspace/folder'
import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useAppStore } from '~renderer/store/state'

import { useFolderWorkspacePathStatusCacheExpiryTick } from '../folder-workspace-path-status-cache-expiry'
import { getFolderPathStatusRouteOptionsForRows } from './host-filtering'

export function useFolderPathStatus(args: {
  allRepoIds: readonly string[]
  repoMap: Map<string, Repo>
  projectGroups: readonly ProjectGroup[]
  folderWorkspaces: readonly FolderWorkspace[]
}) {
  const sshConnectionStates = useAppStore((state) => state.sshConnectionStates)
  const {
    folderWorkspacePathStatuses,
    fetchFolderWorkspacePathStatus,
    getFolderWorkspacePathStatusCacheKey,
    getFreshFolderWorkspacePathStatus,
    activeRuntimeEnvironmentId
  } = useAppStore(
    useShallow((state) => ({
      folderWorkspacePathStatuses: state.folderWorkspacePathStatuses,
      fetchFolderWorkspacePathStatus: state.fetchFolderWorkspacePathStatus,
      getFolderWorkspacePathStatusCacheKey: state.getFolderWorkspacePathStatusCacheKey,
      getFreshFolderWorkspacePathStatus: state.getFreshFolderWorkspacePathStatus,
      activeRuntimeEnvironmentId: state.settings?.activeRuntimeEnvironmentId ?? null
    }))
  )
  const repoMembershipKey = args.allRepoIds
    .map((repoId) => {
      const repo = args.repoMap.get(repoId)
      return `${repoId}:${repo?.path ?? ''}:${repo?.projectGroupId ?? ''}`
    })
    .join('\0')
  const sshConnectionKey = [...sshConnectionStates.entries()]
    .map(([connectionId, state]) => `${connectionId}:${state.status}`)
    .sort()
    .join('\0')
  const cacheExpiryTick = useFolderWorkspacePathStatusCacheExpiryTick(folderWorkspacePathStatuses)
  const projectGroupsById = new Map(args.projectGroups.map((group) => [group.id, group]))
  const folderWorkspacesById = new Map(
    args.folderWorkspaces.map((workspace) => [workspace.id, workspace])
  )
  const getRouteOptions = useEventCallback(
    (request: Parameters<typeof fetchFolderWorkspacePathStatus>[0]) =>
      getFolderPathStatusRouteOptionsForRows({
        request,
        projectGroupsById,
        folderWorkspacesById
      })
  )

  useEffect(() => {
    const requests = new Map<
      string,
      {
        request: Parameters<typeof fetchFolderWorkspacePathStatus>[0]
        options?: { runtimeEnvironmentId: string | null }
      }
    >()
    for (const group of args.projectGroups) {
      if (group.parentPath) {
        const request = { scope: 'project-group' as const, projectGroupId: group.id }
        const options = getRouteOptions(request)
        requests.set(getFolderWorkspacePathStatusCacheKey(request, options), { request, options })
      }
    }
    for (const workspace of args.folderWorkspaces) {
      const request = { scope: 'folder-workspace' as const, folderWorkspaceId: workspace.id }
      const options = getRouteOptions(request)
      requests.set(getFolderWorkspacePathStatusCacheKey(request, options), { request, options })
    }
    for (const { request, options } of requests.values()) {
      void fetchFolderWorkspacePathStatus(request, { force: true, ...options })
    }
  }, [
    activeRuntimeEnvironmentId,
    args.folderWorkspaces,
    args.projectGroups,
    fetchFolderWorkspacePathStatus,
    getFolderWorkspacePathStatusCacheKey,
    getRouteOptions,
    repoMembershipKey,
    sshConnectionKey
  ])

  return (request: Parameters<typeof fetchFolderWorkspacePathStatus>[0]) => {
    const options = getRouteOptions(request)
    const cacheKey = getFolderWorkspacePathStatusCacheKey(request, options)
    // Why: reading both values invalidates expired negative statuses while a
    // fresh request is in flight, so stale paths cannot keep rows disabled.
    void folderWorkspacePathStatuses[cacheKey]
    void cacheExpiryTick
    return getFreshFolderWorkspacePathStatus(request, options)
  }
}
