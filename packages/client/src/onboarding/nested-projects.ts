import type { NestedRepoScanResult } from '@agentstart/protocol/project/group-model'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import {
  buildNestedRepoImportActionTelemetry,
  buildNestedRepoImportResultTelemetry,
  buildNestedRepoScanTelemetry,
  createNestedRepoTelemetryAttemptId,
  shouldEmitNestedRepoImportSubmitTelemetry,
  type NestedRepoTelemetryRuntimeKind
} from '@agentstart/protocol/telemetry/nested-repo'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { getSelectedNestedRepoPathsInScanOrder } from '~renderer/onboarding/nested-repo-selected-paths'
import {
  refreshProjectCatalogTargetRepos,
  refreshProjectCatalogWorktrees
} from '~renderer/project-catalog/refresh'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { useAppStore } from '~renderer/store/state'
import { track } from '~renderer/telemetry/client'

function createNestedRepoScanId(): string {
  return `nested-repo-scan-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

type NestedProjectsOptions = {
  settings: GlobalSettings | null
  busyLabel: string | null
  setBusyLabel: (label: string | null) => void
  setError: (message: string | null) => void
  completeProject: (projectId: string) => Promise<void>
}

export function useNestedProjects({
  settings,
  busyLabel,
  setBusyLabel,
  setError,
  completeProject
}: NestedProjectsOptions) {
  const queryClient = useQueryClient()
  const scanNestedRepos = useAppStore((state) => state.scanNestedRepos)
  const cancelNestedRepoScan = useAppStore((state) => state.cancelNestedRepoScan)
  const importNestedRepos = useAppStore((state) => state.importNestedRepos)
  const [nestedScan, setNestedScan] = useState<NestedRepoScanResult | null>(null)
  const [nestedSelectedPaths, setNestedSelectedPaths] = useState<Set<string>>(new Set())
  const [nestedAttemptId, setNestedAttemptId] = useState<string | null>(null)
  const [nestedRuntimeKind, setNestedRuntimeKind] = useState<NestedRepoTelemetryRuntimeKind | null>(
    null
  )
  const [nestedScanInProgress, setNestedScanInProgress] = useState(false)
  const [nestedImportScanId, setNestedImportScanId] = useState<string | null>(null)
  const nestedScanIdRef = useRef<string | null>(null)
  const defaultRuntimeKind: NestedRepoTelemetryRuntimeKind =
    settings?.activeRuntimeEnvironmentId?.trim() ? 'runtime' : 'local'

  const showReview = (
    scan: NestedRepoScanResult,
    attemptId: string,
    runtimeKind: NestedRepoTelemetryRuntimeKind,
    inProgress = false,
    scanId: string | null = null
  ) => {
    setNestedScan(scan)
    setNestedSelectedPaths(new Set(scan.repos.map((repo) => repo.path)))
    setNestedAttemptId(attemptId)
    setNestedRuntimeKind(runtimeKind)
    setNestedScanInProgress(inProgress)
    setNestedImportScanId(scanId)
  }

  const scanForNestedProjects = async (
    path: string,
    runtimeKind: NestedRepoTelemetryRuntimeKind
  ): Promise<boolean> => {
    const attemptId = createNestedRepoTelemetryAttemptId()
    if (runtimeKind === 'runtime') {
      const scan = await scanNestedRepos(path)
      track(
        'add_repo_nested_scan_result',
        buildNestedRepoScanTelemetry({ attemptId, surface: 'onboarding', runtimeKind, scan })
      )
      if (scan?.selectedPathKind === 'non_git_folder' && scan.repos.length > 0) {
        showReview(scan, attemptId, runtimeKind)
        return true
      }
      return false
    }

    const scanId = createNestedRepoScanId()
    nestedScanIdRef.current = scanId
    setNestedScanInProgress(true)
    try {
      const scan = await scanNestedRepos(path, {
        scanId,
        onProgress: (progressScan) => {
          if (
            nestedScanIdRef.current !== scanId ||
            progressScan.selectedPathKind !== 'non_git_folder' ||
            progressScan.repos.length === 0
          ) {
            return
          }
          showReview(progressScan, attemptId, runtimeKind, true, scanId)
        }
      })
      if (nestedScanIdRef.current !== scanId) {
        return true
      }
      track(
        'add_repo_nested_scan_result',
        buildNestedRepoScanTelemetry({ attemptId, surface: 'onboarding', runtimeKind, scan })
      )
      if (scan?.selectedPathKind === 'non_git_folder' && scan.repos.length > 0) {
        showReview(scan, attemptId, runtimeKind, false, scanId)
        return true
      }
      return false
    } finally {
      if (nestedScanIdRef.current === scanId) {
        nestedScanIdRef.current = null
      }
      setNestedScanInProgress(false)
    }
  }

  const importNested = async () => {
    const attemptId = nestedAttemptId
    if (
      !nestedScan ||
      !attemptId ||
      !shouldEmitNestedRepoImportSubmitTelemetry({
        attemptId,
        selectedCount: nestedSelectedPaths.size,
        isBusy: busyLabel !== null
      })
    ) {
      return
    }
    const foundCount = nestedScan.repos.length
    const selectedCount = nestedSelectedPaths.size
    const runtimeKind = nestedRuntimeKind ?? defaultRuntimeKind
    setError(null)
    setBusyLabel('Importing repositories…')
    track(
      'add_repo_nested_import_action',
      buildNestedRepoImportActionTelemetry({
        attemptId,
        surface: 'onboarding',
        runtimeKind,
        action: 'import_separate',
        foundCount,
        selectedCount
      })
    )
    let resultTracked = false
    try {
      const projectPaths = getSelectedNestedRepoPathsInScanOrder(nestedScan, nestedSelectedPaths)
      const result = await importNestedRepos({
        parentPath: nestedScan.selectedPath,
        groupName: '',
        projectPaths,
        ...(nestedImportScanId ? { scanId: nestedImportScanId } : {}),
        mode: 'separate'
      })
      track(
        'add_repo_nested_import_result',
        buildNestedRepoImportResultTelemetry({
          attemptId,
          surface: 'onboarding',
          runtimeKind,
          mode: 'separate',
          foundCount,
          selectedCount,
          result
        })
      )
      resultTracked = true
      const projectIds =
        result?.projects
          .map((entry) => entry.projectId)
          .filter((projectId): projectId is string => typeof projectId === 'string') ?? []
      const projectId = projectIds[0]
      if (!projectId) {
        const firstFailure = result?.projects.find((entry) => entry.status === 'failed')?.error
        throw new Error(
          firstFailure ? `No repositories imported: ${firstFailure}` : 'No repositories imported'
        )
      }
      const importedRepos = (
        await refreshProjectCatalogTargetRepos(queryClient, getActiveRuntimeTarget(settings))
      ).filter((repo) => projectIds.includes(repo.id))
      await Promise.all(
        importedRepos.map((repo) => refreshProjectCatalogWorktrees(queryClient, repo))
      )
      await completeProject(projectId)
    } catch (error) {
      if (!resultTracked) {
        track(
          'add_repo_nested_import_result',
          buildNestedRepoImportResultTelemetry({
            attemptId,
            surface: 'onboarding',
            runtimeKind,
            mode: 'separate',
            foundCount,
            selectedCount,
            result: null
          })
        )
      }
      setError(error instanceof Error ? error.message : String(error))
      track('onboarding_step4_path_failed', { path: 'open_folder', reason: 'invalid_path' })
    } finally {
      setBusyLabel(null)
    }
  }

  const trackBackAndClear = () => {
    if (nestedScan && nestedAttemptId) {
      track(
        'add_repo_nested_import_action',
        buildNestedRepoImportActionTelemetry({
          attemptId: nestedAttemptId,
          surface: 'onboarding',
          runtimeKind: nestedRuntimeKind ?? defaultRuntimeKind,
          action: 'back',
          foundCount: nestedScan.repos.length,
          selectedCount: nestedSelectedPaths.size
        })
      )
    }
    setNestedScan(null)
    setNestedSelectedPaths(new Set())
    setNestedAttemptId(null)
    setNestedRuntimeKind(null)
    setNestedScanInProgress(false)
    setNestedImportScanId(null)
    nestedScanIdRef.current = null
    setBusyLabel(null)
    setError(null)
  }

  const cancelNested = () => {
    if (busyLabel !== null && !nestedScanInProgress) {
      return
    }
    if (nestedScanInProgress && nestedScanIdRef.current) {
      void cancelNestedRepoScan(nestedScanIdRef.current)
    }
    trackBackAndClear()
  }

  const stopNestedScan = () => {
    if (nestedScanIdRef.current) {
      void cancelNestedRepoScan(nestedScanIdRef.current)
    }
  }

  return {
    nestedScan,
    nestedScanInProgress,
    nestedSelectedPaths,
    setNestedSelectedPaths,
    importNested,
    cancelNested,
    stopNestedScan,
    canImportNestedForTelemetry: () =>
      Boolean(nestedScan && nestedAttemptId && nestedSelectedPaths.size > 0),
    scanForNestedProjects,
    trackBackAndClear
  }
}
