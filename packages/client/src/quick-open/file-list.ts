import { isWindowsAbsolutePathLike } from '@agentstart/protocol/host/path'
import type { Worktree } from '@agentstart/protocol/worktree/model'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { createBrowserUuid } from '~renderer/browser/uuid'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { projectCatalogRepoBuckets } from '~renderer/project-catalog/repo-buckets'
import { cancelRuntimeFileList, listRuntimeFiles } from '~renderer/runtime/file-client'
import { useWorktreesForRepo } from '~renderer/store/selectors'
import { useAppStore } from '~renderer/store/state'

import {
  getFileExplorerOperationOwnerFromState,
  getFileExplorerOwnerUnresolvedMessage,
  getFileExplorerOperationRoute
} from '../workspace-panel/file-explorer/operation-owner'
import type { FileExplorerOperationOwner } from '../workspace-panel/file-explorer/types'

export type RuntimeFileListState = {
  files: string[]
  loading: boolean
  loadError: string | null
  operationOwner?: FileExplorerOperationOwner
}

function cleanRuntimeFileListError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/^Error invoking remote method '[^']+':\s*Error:\s*/, '')
}

function isNestedWorktreePath(parentPath: string, childPath: string): boolean {
  const windowsPath = isWindowsAbsolutePathLike(parentPath)
  const parent = parentPath.replace(/[\\/]+$/, '').replace(/\\/g, '/')
  const child = childPath.replace(/\\/g, '/')
  // Why: Windows paths are case-insensitive and can arrive with mixed slash
  // styles from git and the host shell. Normalize before deciding whether to exclude a
  // nested linked worktree from file scans.
  const comparableParent = windowsPath ? parent.toLowerCase() : parent
  const comparableChild = windowsPath ? child.toLowerCase() : child
  return comparableChild.startsWith(`${comparableParent}/`)
}

function getNestedWorktreeExcludePaths(
  worktreeId: string,
  worktreePath: string,
  repoWorktrees: readonly Worktree[]
): string[] {
  return repoWorktrees
    .filter(
      (worktree) => worktree.id !== worktreeId && isNestedWorktreePath(worktreePath, worktree.path)
    )
    .map((worktree) => worktree.path)
    .sort()
}

type NestedWorktreeExcludeRequest = {
  paths: string[]
  key: string
}

type RuntimeFileListTarget = {
  canList: boolean
  excludeRequest: NestedWorktreeExcludeRequest
  worktreePath: string | null
}

function getRuntimeFileListTarget(
  worktreeId: string | null,
  worktreePath: string | null | undefined,
  repoWorktrees: readonly Worktree[]
): RuntimeFileListTarget {
  const resolvedWorktreePath = worktreePath ?? null
  if (!worktreeId || !resolvedWorktreePath) {
    return { canList: false, excludeRequest: { paths: [], key: '[]' }, worktreePath: null }
  }
  return {
    canList: true,
    excludeRequest: getNestedWorktreeExcludeRequest(
      worktreeId,
      resolvedWorktreePath,
      repoWorktrees
    ),
    worktreePath: resolvedWorktreePath
  }
}

function getNestedWorktreeExcludeRequest(
  worktreeId: string | null,
  worktreePath: string | null,
  repoWorktrees: readonly Worktree[]
): NestedWorktreeExcludeRequest {
  if (!worktreeId || !worktreePath || repoWorktrees.length === 0) {
    return { paths: [], key: '[]' }
  }
  const paths = getNestedWorktreeExcludePaths(worktreeId, worktreePath, repoWorktrees)
  // Why: worktree paths can contain newlines. Use JSON as a stable dependency
  // key while passing the original array to IPC so paths stay lossless.
  return { paths, key: JSON.stringify(paths) }
}

export function useRuntimeFileListForWorktree({
  enabled,
  worktreeId
}: {
  enabled: boolean
  worktreeId: string | null
}): RuntimeFileListState {
  const worktree = useAppStore((state) =>
    // Why: folder workspaces live behind getKnownWorktreeById, not worktreesByRepo.
    worktreeId ? (state.getKnownWorktreeById(worktreeId) ?? null) : null
  )
  const worktreePath = worktree?.path ?? null
  const repoWorktrees = useWorktreesForRepo(worktree?.repoId ?? null)
  const catalog = useProjectCatalog()
  const catalogBuckets = projectCatalogRepoBuckets(catalog)
  const target = getRuntimeFileListTarget(worktreeId, worktreePath, repoWorktrees)
  const { excludeRequest } = target
  const excludePathsRef = useRef(excludeRequest.paths)

  const operationOwnerUiState = useAppStore(
    useShallow((state) => ({
      settings: state.settings,
      restoredRuntimeHostIdByWorkspaceSessionKey: state.restoredRuntimeHostIdByWorkspaceSessionKey
    }))
  )
  const operationOwnerState = {
    ...operationOwnerUiState,
    detectedWorktreesByRepo: catalogBuckets.detectedWorktreesByRepo,
    folderWorkspaces: catalog.folderWorkspaces,
    projectGroups: catalog.projectGroups,
    repos: catalog.repos,
    worktreesByRepo: catalogBuckets.worktreesByRepo
  }
  const operationOwner = (() =>
    getFileExplorerOperationOwnerFromState(operationOwnerState, worktreeId))()
  const operationOwnerKey = JSON.stringify(operationOwner)
  const operationOwnerRef = useRef(operationOwner)
  useEffect(() => {
    excludePathsRef.current = excludeRequest.paths
    operationOwnerRef.current = operationOwner
  }, [excludeRequest.paths, operationOwner])
  const operationRoute = getFileExplorerOperationRoute(operationOwner)
  const operationRouteAvailable = operationRoute !== null
  const connectionId = operationRoute?.connectionId
  const runtimeEnvironmentId = operationRoute?.settings.activeRuntimeEnvironmentId ?? null
  const activeTargetStatus = useAppStore((state) =>
    connectionId ? state.sshConnectionStates.get(connectionId)?.status : undefined
  )
  const connectionPending =
    activeTargetStatus === 'connecting' ||
    activeTargetStatus === 'deploying-relay' ||
    activeTargetStatus === 'reconnecting'
  const requestKey = (() =>
    `${worktreePath ?? ''}\n${operationOwnerKey}\n${excludeRequest.key}\n${activeTargetStatus ?? ''}`)()
  const [listedState, setListedState] = useState<RuntimeFileListState & { requestKey: string }>({
    requestKey: '',
    files: [],
    loading: false,
    loadError: null,
    operationOwner: { kind: 'unresolved' }
  })
  const visibleState: RuntimeFileListState = !enabled
    ? { files: [], loading: false, loadError: null, operationOwner: { kind: 'unresolved' } }
    : !target.canList || !worktreeId || !worktreePath || !operationRouteAvailable
      ? {
          files: [],
          loading: false,
          loadError: operationRouteAvailable ? null : getFileExplorerOwnerUnresolvedMessage(),
          operationOwner: { kind: 'unresolved' }
        }
      : listedState.requestKey === requestKey
        ? listedState
        : {
            files: [],
            loading: true,
            loadError: null,
            operationOwner: { kind: 'unresolved' }
          }

  useEffect(() => {
    if (!enabled || !target.canList || !worktreeId || !worktreePath || !operationRouteAvailable) {
      return
    }

    let cancelled = false
    const excludePaths = excludePathsRef.current.length > 0 ? excludePathsRef.current : undefined
    const requestToken = createBrowserUuid()
    const requestOperationOwner = operationOwnerRef.current
    const requestContext = {
      settings: { activeRuntimeEnvironmentId: runtimeEnvironmentId },
      worktreeId,
      worktreePath,
      connectionId
    }

    void listRuntimeFiles(requestContext, {
      rootPath: worktreePath,
      excludePaths,
      requestToken
    })
      .then((result) => {
        if (!cancelled) {
          setListedState({
            requestKey,
            files: result,
            loading: false,
            loadError: null,
            operationOwner: requestOperationOwner
          })
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setListedState({
            requestKey,
            files: [],
            loading: false,
            loadError: cleanRuntimeFileListError(error),
            operationOwner: { kind: 'unresolved' }
          })
        }
      })

    return () => {
      cancelled = true
      // Why #7721: switching workspaces (or closing the palette) must abort
      // the previous full-tree scan host- and relay-side. Over SSH, abandoned
      // scans otherwise stack up and starve fs.readDir/fs.stat past their
      // 30s timeout ("Could not load files for this workspace").
      cancelRuntimeFileList(requestContext, requestToken)
    }
  }, [
    enabled,
    excludeRequest.key,
    connectionId,
    operationOwnerKey,
    operationRouteAvailable,
    requestKey,
    runtimeEnvironmentId,
    target.canList,
    worktreeId,
    worktreePath
  ])

  return {
    ...visibleState,
    loading: visibleState.loading || connectionPending
  }
}
