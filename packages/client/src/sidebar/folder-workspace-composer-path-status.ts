import type { ProjectGroup } from '@agentstart/protocol/project/group-model'
import { isConfirmedStaleFolderPathStatus } from '@agentstart/protocol/workspace/folder-path'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  getFolderWorkspacePathStatusDescription,
  getFolderWorkspacePathStatusTitle
} from '~renderer/sidebar/folder-workspace-path-status'
import { useFolderWorkspacePathStatusCacheExpiryTick } from '~renderer/sidebar/folder-workspace-path-status-cache-expiry'
import { useAppStore } from '~renderer/store/state'

export function useFolderWorkspaceComposerPathStatus(
  projectGroup: ProjectGroup | null,
  open: boolean,
  runtimeEnvironmentId?: string | null
): {
  pathStatusBlocksCreate: boolean
  pathStatusProjectError: string | null
} {
  const {
    folderWorkspacePathStatuses,
    fetchFolderWorkspacePathStatus,
    getFolderWorkspacePathStatusCacheKey,
    getFreshFolderWorkspacePathStatus
  } = useAppStore(
    useShallow((s) => ({
      folderWorkspacePathStatuses: s.folderWorkspacePathStatuses,
      fetchFolderWorkspacePathStatus: s.fetchFolderWorkspacePathStatus,
      getFolderWorkspacePathStatusCacheKey: s.getFolderWorkspacePathStatusCacheKey,
      getFreshFolderWorkspacePathStatus: s.getFreshFolderWorkspacePathStatus
    }))
  )
  const pathStatusRequest = (() =>
    projectGroup ? { scope: 'project-group' as const, projectGroupId: projectGroup.id } : null)()
  const cacheExpiryTick = useFolderWorkspacePathStatusCacheExpiryTick(folderWorkspacePathStatuses)
  const activePathStatusRefreshIdRef = useRef(0)
  const [completedPathStatusRefreshKey, setCompletedPathStatusRefreshKey] = useState<string | null>(
    null
  )
  const pathStatusRouteOptions = (() => ({ runtimeEnvironmentId: runtimeEnvironmentId ?? null }))()
  const pathStatusCacheKey = pathStatusRequest
    ? getFolderWorkspacePathStatusCacheKey(pathStatusRequest, pathStatusRouteOptions)
    : null
  const pathStatusRefreshKey = pathStatusCacheKey
    ? `${pathStatusCacheKey}:${cacheExpiryTick}`
    : null
  const cachedPathStatusEntry = pathStatusCacheKey
    ? folderWorkspacePathStatuses[pathStatusCacheKey]
    : undefined
  const pathStatus = (() => {
    if (!pathStatusRequest || pathStatusCacheKey === null) {
      return null
    }
    // Why: subscribe to cache writes, but only let the TTL-aware accessor decide
    // whether a cached negative status is still authoritative.
    void cachedPathStatusEntry
    void cacheExpiryTick
    return getFreshFolderWorkspacePathStatus(pathStatusRequest, pathStatusRouteOptions)
  })()

  useEffect(() => {
    if (!open || !pathStatusRequest || pathStatusRefreshKey === null) {
      return
    }
    const refreshId = activePathStatusRefreshIdRef.current + 1
    activePathStatusRefreshIdRef.current = refreshId
    void Promise.resolve(
      fetchFolderWorkspacePathStatus(pathStatusRequest, { force: true, runtimeEnvironmentId })
    ).finally(() => {
      if (activePathStatusRefreshIdRef.current !== refreshId) {
        return
      }
      setCompletedPathStatusRefreshKey(pathStatusRefreshKey)
    })
  }, [
    fetchFolderWorkspacePathStatus,
    open,
    pathStatusRefreshKey,
    pathStatusRequest,
    runtimeEnvironmentId
  ])

  const pathStatusRefreshPending =
    open &&
    pathStatusRequest !== null &&
    pathStatusRefreshKey !== null &&
    pathStatus === null &&
    completedPathStatusRefreshKey !== pathStatusRefreshKey
  const cachedBlockingPathStatus =
    pathStatus === null &&
    cachedPathStatusEntry?.status.exists === false &&
    isConfirmedStaleFolderPathStatus(cachedPathStatusEntry.status)
  const pathStatusBlocksCreate =
    pathStatusRefreshPending ||
    cachedBlockingPathStatus ||
    (pathStatus?.exists === false && isConfirmedStaleFolderPathStatus(pathStatus))
  const displayPathStatus =
    pathStatus ?? (cachedBlockingPathStatus ? (cachedPathStatusEntry?.status ?? null) : null)
  const title =
    displayPathStatus?.exists === false
      ? getFolderWorkspacePathStatusTitle(displayPathStatus)
      : null
  const pathStatusProjectError =
    title && displayPathStatus
      ? `${title}. ${getFolderWorkspacePathStatusDescription(displayPathStatus)}`
      : null

  return { pathStatusBlocksCreate, pathStatusProjectError }
}
