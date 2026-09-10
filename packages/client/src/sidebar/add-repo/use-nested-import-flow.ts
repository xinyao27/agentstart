import type {
  NestedRepoScanResult,
  ProjectGroupImportResult
} from '@agentstart/protocol/project/group-model'
import type { AddRepoExistingWorkspaceSource } from '@agentstart/protocol/telemetry/events/foundations'
import {
  buildNestedRepoImportActionTelemetry,
  buildNestedRepoImportResultTelemetry,
  shouldEmitNestedRepoImportSubmitTelemetry,
  type NestedRepoTelemetryRuntimeKind
} from '@agentstart/protocol/telemetry/nested-repo'
import { useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { getSelectedNestedRepoPathsInScanOrder } from '~renderer/onboarding/nested-repo-selected-paths'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import {
  refreshProjectCatalogTargetRepos,
  refreshProjectCatalogWorktrees
} from '~renderer/project-catalog/refresh'
import { useAppStore } from '~renderer/store/state'
import { track } from '~renderer/telemetry/client'

import { addNonGitFolderAndActivate } from '../add-non-git-folder-command'

export function useAddRepoNestedImportFlow({
  nestedAttemptId,
  nestedScan,
  nestedSelectedPaths,
  nestedRuntimeKind,
  nestedGroupName,
  nestedImportScanId,
  activeRuntimeEnvironmentId,
  importNestedRepos,
  getNestedRepoRuntimeKind,
  onGitRepoReady,
  setIsAdding
}: {
  nestedAttemptId: string | null
  nestedScan: NestedRepoScanResult | null
  nestedSelectedPaths: Set<string>
  nestedRuntimeKind: NestedRepoTelemetryRuntimeKind | null
  nestedGroupName: string
  nestedImportScanId: string | null
  activeRuntimeEnvironmentId: string | null | undefined
  importNestedRepos: (args: {
    parentPath: string
    groupName: string
    projectPaths: string[]
    scanId?: string
    mode: 'group' | 'separate'
  }) => Promise<ProjectGroupImportResult | null>
  getNestedRepoRuntimeKind: () => NestedRepoTelemetryRuntimeKind
  onGitRepoReady: (repoId: string, source: AddRepoExistingWorkspaceSource) => Promise<void>
  setIsAdding: (isAdding: boolean) => void
}): {
  handleImportNestedRepos: (mode: 'group' | 'separate') => Promise<void>
  handleOpenNestedRootFolder: () => Promise<void>
  resetNestedImportFlow: () => void
  trackNestedBackAction: () => void
} {
  const queryClient = useQueryClient()
  const projectCatalog = useProjectCatalog()
  const nestedImportGenRef = useRef(0)

  const resetNestedImportFlow = (): void => {
    nestedImportGenRef.current++
  }

  const trackNestedBackAction = (): void => {
    if (!nestedScan || !nestedAttemptId) {
      return
    }
    track(
      'add_repo_nested_import_action',
      buildNestedRepoImportActionTelemetry({
        attemptId: nestedAttemptId,
        surface: 'sidebar',
        runtimeKind: nestedRuntimeKind ?? getNestedRepoRuntimeKind(),
        action: 'back',
        foundCount: nestedScan.repos.length,
        selectedCount: nestedSelectedPaths.size
      })
    )
  }

  const handleImportNestedRepos = async (mode: 'group' | 'separate'): Promise<void> => {
    const attemptId = nestedAttemptId
    if (
      !nestedScan ||
      !attemptId ||
      !shouldEmitNestedRepoImportSubmitTelemetry({
        attemptId,
        selectedCount: nestedSelectedPaths.size
      })
    ) {
      return
    }
    const foundCount = nestedScan.repos.length
    const selectedCount = nestedSelectedPaths.size
    const selectedProjectPaths = getSelectedNestedRepoPathsInScanOrder(
      nestedScan,
      nestedSelectedPaths
    )
    const runtimeKind = nestedRuntimeKind ?? getNestedRepoRuntimeKind()
    const gen = ++nestedImportGenRef.current
    setIsAdding(true)
    track(
      'add_repo_nested_import_action',
      buildNestedRepoImportActionTelemetry({
        attemptId,
        surface: 'sidebar',
        runtimeKind,
        action: mode === 'group' ? 'import_group' : 'import_separate',
        foundCount,
        selectedCount
      })
    )
    let resultTracked = false
    try {
      const result = await importNestedRepos({
        parentPath: nestedScan.selectedPath,
        groupName: nestedGroupName,
        // Why: Set insertion order can drift after deselect/reselect; import
        // ordering should match the visible scan order users reviewed.
        projectPaths: selectedProjectPaths,
        ...(nestedImportScanId ? { scanId: nestedImportScanId } : {}),
        mode
      })
      track(
        'add_repo_nested_import_result',
        buildNestedRepoImportResultTelemetry({
          attemptId,
          surface: 'sidebar',
          runtimeKind,
          mode,
          foundCount,
          selectedCount,
          result
        })
      )
      resultTracked = true
      if (!result) {
        return
      }
      const importedRepoIds = result.projects
        .map((entry) => entry.projectId)
        .filter((projectId): projectId is string => typeof projectId === 'string')
      const firstRepoId = importedRepoIds[0]
      if (!firstRepoId) {
        const firstFailure = result.projects.find((entry) => entry.status === 'failed')?.error
        if (gen === nestedImportGenRef.current) {
          toast.error(
            translate(
              'auto.components.sidebar.useAddRepoNestedImportFlow.1b33c5f090',
              'No repositories imported'
            ),
            {
              description: firstFailure ?? undefined
            }
          )
        }
        return
      }
      const target = activeRuntimeEnvironmentId?.trim()
        ? { kind: 'environment' as const, environmentId: activeRuntimeEnvironmentId.trim() }
        : ({ kind: 'local' } as const)
      const refreshedRepos = await refreshProjectCatalogTargetRepos(queryClient, target)
      const importedRepos = refreshedRepos.filter((repo) => importedRepoIds.includes(repo.id))
      await Promise.all(
        importedRepos.map((repo) => refreshProjectCatalogWorktrees(queryClient, repo))
      )
      if (gen !== nestedImportGenRef.current) {
        return
      }
      if (result.failedCount > 0) {
        toast.warning(
          translate(
            'auto.components.sidebar.useAddRepoNestedImportFlow.cbfbc7a797',
            'Some repositories could not be imported'
          ),
          {
            description: translate(
              'auto.components.sidebar.useAddRepoNestedImportFlow.680cac2c82',
              '{{value0}} failed',
              { value0: result.failedCount }
            )
          }
        )
      }
      const repo =
        importedRepos.find((entry) => entry.id === firstRepoId) ??
        projectCatalog.repos.find((entry) => entry.id === firstRepoId)
      if (repo) {
        const source: AddRepoExistingWorkspaceSource = activeRuntimeEnvironmentId?.trim()
          ? 'runtime_server_path'
          : 'local_folder_picker'
        await onGitRepoReady(repo.id, source)
      }
    } catch (err) {
      if (gen === nestedImportGenRef.current) {
        toast.error(err instanceof Error ? err.message : String(err))
      }
    } finally {
      if (!resultTracked) {
        track(
          'add_repo_nested_import_result',
          buildNestedRepoImportResultTelemetry({
            attemptId,
            surface: 'sidebar',
            runtimeKind,
            mode,
            foundCount,
            selectedCount,
            result: null
          })
        )
      }
      if (gen === nestedImportGenRef.current) {
        setIsAdding(false)
      }
    }
  }

  const handleOpenNestedRootFolder = async (): Promise<void> => {
    if (!nestedScan) {
      return
    }
    const gen = ++nestedImportGenRef.current
    const path = nestedScan.selectedPath
    if (nestedAttemptId) {
      track(
        'add_repo_nested_import_action',
        buildNestedRepoImportActionTelemetry({
          attemptId: nestedAttemptId,
          surface: 'sidebar',
          runtimeKind: nestedRuntimeKind ?? getNestedRepoRuntimeKind(),
          action: 'open_as_folder',
          foundCount: nestedScan.repos.length,
          selectedCount: nestedSelectedPaths.size
        })
      )
    }
    setIsAdding(true)
    try {
      const repo = await addNonGitFolderAndActivate(useAppStore.getState, path, {
        runtimeEnvironmentId: activeRuntimeEnvironmentId?.trim() || null
      })
      if (gen !== nestedImportGenRef.current) {
        return
      }
      if (repo) {
        useAppStore.getState().closeModal()
      }
    } catch (err) {
      if (gen === nestedImportGenRef.current) {
        toast.error(err instanceof Error ? err.message : String(err))
      }
    } finally {
      if (gen === nestedImportGenRef.current) {
        setIsAdding(false)
      }
    }
  }

  return {
    handleImportNestedRepos,
    handleOpenNestedRootFolder,
    resetNestedImportFlow,
    trackNestedBackAction
  }
}
