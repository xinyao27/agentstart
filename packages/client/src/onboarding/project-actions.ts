import { isGitRepoKind } from '@agentstart/protocol/project/repository'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { ONBOARDING_FINAL_STEP } from '@agentstart/protocol/settings/onboarding'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { readProjectCatalogMutationRevision } from '~renderer/project-catalog/catalog-snapshot'
import { refreshAfterProjectCatalogMutation } from '~renderer/project-catalog/mutation-refresh'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import {
  refreshProjectCatalogTargetRepos,
  refreshProjectCatalogWorktrees
} from '~renderer/project-catalog/refresh'
import { requireRepoProtocolClient } from '~renderer/runtime/repo-catalog-target'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import { useAppStore } from '~renderer/store/state'
import { track } from '~renderer/telemetry/client'

import { useProjectDefaultCheckoutHandoff } from '../sidebar/project-added-default-checkout'
import { useNestedProjects } from './nested-projects'
import { completeOnboardingProject } from './project-completion'
import type { useCloseWith } from './use-onboarding-flow-persistence'

type OnboardingProjectActionsOptions = {
  settings: GlobalSettings | null
  busyLabel: string | null
  setBusyLabel: (label: string | null) => void
  setError: (message: string | null) => void
  closeWith: ReturnType<typeof useCloseWith>
  consumeStepDurationMs: () => number
}

export function useOnboardingProjectActions({
  settings,
  busyLabel,
  setBusyLabel,
  setError,
  closeWith,
  consumeStepDurationMs
}: OnboardingProjectActionsOptions) {
  const queryClient = useQueryClient()
  const projectCatalog = useProjectCatalog()
  const { repos } = projectCatalog
  const { openProjectDefaultCheckout } = useProjectDefaultCheckoutHandoff()
  const setHideDefaultBranchWorkspace = useAppStore((state) => state.setHideDefaultBranchWorkspace)
  const addRepoPath = useAppStore((state) => state.addRepoPath)
  const [cloneUrl, setCloneUrl] = useState('')
  const [serverPath, setServerPath] = useState('')
  const [cloneDestination, setCloneDestination] = useState('')

  const refreshProjectWorktrees = async (projectId: string) => {
    const target = getActiveRuntimeTarget(settings)
    const repo =
      repos.find((candidate) => candidate.id === projectId) ??
      (await refreshProjectCatalogTargetRepos(queryClient, target)).find(
        (candidate) => candidate.id === projectId
      )
    return repo ? (await refreshProjectCatalogWorktrees(queryClient, repo)).worktrees : []
  }

  const completeProject = (
    projectId: string,
    isGit = true,
    path: 'open_folder' | 'clone_url' = 'open_folder'
  ) =>
    completeOnboardingProject({
      projectId,
      isGit,
      path,
      settings,
      openProjectDefaultCheckout,
      refreshProjectWorktrees,
      setHideDefaultBranchWorkspace,
      closeWith,
      consumeStepDurationMs
    })
  const nestedProjects = useNestedProjects({
    settings,
    busyLabel,
    setBusyLabel,
    setError,
    completeProject
  })

  const openFolder = async (kind: 'git' | 'folder' = 'git') => {
    if (busyLabel !== null) {
      return
    }
    setError(null)
    if (settings?.activeRuntimeEnvironmentId?.trim()) {
      const path = serverPath.trim()
      if (!path) {
        setError('Enter a path on the selected host.')
        return
      }
      track('onboarding_step4_path_clicked', { path: 'open_folder' })
      setBusyLabel(kind === 'git' ? 'Scanning for repositories…' : 'Opening folder…')
      try {
        if (kind === 'git' && (await nestedProjects.scanForNestedProjects(path, 'runtime'))) {
          return
        }
        setBusyLabel(kind === 'git' ? 'Opening project…' : 'Opening folder…')
        const repo = await addRepoPath(path, kind)
        if (!repo) {
          track('onboarding_step4_path_failed', { path: 'open_folder', reason: 'invalid_path' })
          return
        }
        await completeProject(repo.id, isGitRepoKind(repo))
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error))
        track('onboarding_step4_path_failed', { path: 'open_folder', reason: 'invalid_path' })
      } finally {
        setBusyLabel(null)
      }
      return
    }

    track('onboarding_step4_path_clicked', { path: 'open_folder' })
    const path = await workspaceHostClient.repos.pickFolder()
    if (!path) {
      track('onboarding_step4_path_failed', { path: 'open_folder', reason: 'cancelled' })
      return
    }
    setBusyLabel('Opening project…')
    try {
      const target = { kind: 'local' } as const
      const expectedRevision = readProjectCatalogMutationRevision(target)
      let result = await workspaceHostClient.repos.add({ expectedRevision, path })
      if ('error' in result && result.error.includes('Not a valid git repository')) {
        setBusyLabel('Scanning for repositories...')
        if (await nestedProjects.scanForNestedProjects(path, 'local')) {
          return
        }
        result = await workspaceHostClient.repos.add({ expectedRevision, path, kind: 'folder' })
      }
      if ('error' in result) {
        throw new Error(result.error)
      }
      await refreshAfterProjectCatalogMutation(target, result.revision)
      await completeProject(result.repo.id, isGitRepoKind(result.repo))
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
      track('onboarding_step4_path_failed', { path: 'open_folder', reason: 'invalid_path' })
    } finally {
      setBusyLabel(null)
    }
  }

  const clone = async () => {
    if (busyLabel !== null) {
      return
    }
    const url = cloneUrl.trim()
    if (!url || !settings) {
      return
    }
    setError(null)
    track('onboarding_step4_path_clicked', { path: 'clone_url' })
    const target = getActiveRuntimeTarget(settings)
    const expectedRevision = readProjectCatalogMutationRevision(target)
    const destination =
      target.kind === 'environment' ? cloneDestination.trim() : settings.workspaceDir
    if (!destination) {
      setError('Enter a host path for the clone destination.')
      return
    }
    setBusyLabel('Cloning repo…')
    try {
      const result =
        target.kind === 'environment'
          ? await (
              await requireRepoProtocolClient(target)
            ).clone({ expectedRevision, url, destination }, { timeoutMs: 10 * 60_000 })
          : await workspaceHostClient.repos.clone({ expectedRevision, url, destination })
      await refreshAfterProjectCatalogMutation(target, result.revision)
      await completeProject(result.repo.id, true, 'clone_url')
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
      track('onboarding_step4_path_failed', { path: 'clone_url', reason: 'clone_failed' })
      toast.error(
        translate('auto.components.onboarding.use.onboarding.flow.fd74e7558e', 'Clone failed'),
        { description: error instanceof Error ? error.message : String(error) }
      )
    } finally {
      setBusyLabel(null)
    }
  }

  const continueWithExistingProject = async (advancedVia: 'button' | 'keyboard' = 'button') => {
    if (busyLabel !== null || repos.length === 0) {
      return
    }
    setError(null)
    setBusyLabel('Finishing...')
    try {
      const checklist = repos.some((repo) => isGitRepoKind(repo))
        ? { addedRepo: true }
        : { addedFolder: true }
      const closed = await closeWith('completed', checklist, ONBOARDING_FINAL_STEP)
      if (closed) {
        track('onboarding_step_completed', {
          step: ONBOARDING_FINAL_STEP,
          value_kind: 'repo',
          duration_ms: consumeStepDurationMs(),
          advanced_via: advancedVia
        })
      }
    } finally {
      setBusyLabel(null)
    }
  }

  return {
    cloneUrl,
    setCloneUrl,
    serverPath,
    setServerPath,
    cloneDestination,
    setCloneDestination,
    hasExistingProject: repos.length > 0,
    openFolder,
    clone,
    continueWithExistingProject,
    ...nestedProjects
  }
}
