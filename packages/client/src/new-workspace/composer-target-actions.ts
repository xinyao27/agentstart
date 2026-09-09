import type { GitPushTarget } from '@yiru/protocol/git/worktree-source'
import type { ExecutionHostScope } from '@yiru/protocol/host/identity'
import type { ProjectGroup } from '@yiru/protocol/project/group-model'
import type { Project, ProjectHostSetup } from '@yiru/protocol/project/model'
import type { Repo } from '@yiru/protocol/project/repository'
import type { SparsePreset } from '@yiru/protocol/worktree/create-result'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { getProjectGroupIdFromNewWorkspaceOptionId } from '~renderer/new-workspace-composer-card/new-workspace-project-options'
import type { ProjectHostSetupOption } from '~renderer/new-workspace-composer-card/project-host-setup-options'
import { getWorkspaceSourceProvider as getLinkedWorkItemProvider } from '~renderer/new-workspace/naming/source'
import { getFolderSourceRepos } from '~renderer/sidebar/folder-workspace-composer-model'

import {
  resolveWorkspaceCreationRepoId,
  type WorkspaceCreationTargetResolution
} from './project-host-workspace-target'
import type { SmartGitHubPrStartPointSelection } from './resolve-smart-github-submit'
import type { LinkedWorkItemSummary } from './workspace-creation'

type ComposerTargetActionsOptions = {
  baseBranch: string | undefined
  eligibleRepos: Repo[]
  folderSourceRepos: Repo[]
  markInitialProjectGroupApplied: () => void
  isProjectGroupTarget: boolean
  linkedWorkItem: LinkedWorkItemSummary | null
  projectGroups: ProjectGroup[]
  projectHostSetupOptions: ProjectHostSetupOption[]
  projectHostSetups: ProjectHostSetup[]
  projects: Project[]
  repoId: string
  repos: Repo[]
  selectedWorkspaceTarget: WorkspaceCreationTargetResolution
  setBaseBranch: Dispatch<SetStateAction<string | undefined>>
  setBranchNameOverride: Dispatch<SetStateAction<string | undefined>>
  setBranchNameOverridePreservesNameEdits: Dispatch<SetStateAction<boolean>>
  setCompareBaseRef: Dispatch<SetStateAction<string | undefined>>
  setForkPushWarning: Dispatch<SetStateAction<string | null>>
  setLinkedPR: Dispatch<SetStateAction<number | null>>
  setLinkedWorkItem: Dispatch<SetStateAction<LinkedWorkItemSummary | null>>
  setProjectError: Dispatch<SetStateAction<string | null>>
  setPushTarget: Dispatch<SetStateAction<GitPushTarget | undefined>>
  setRepoId: (value: string) => void
  setReuseEligibleBranch: Dispatch<SetStateAction<string | null>>
  setReuseSelectedBranch: Dispatch<SetStateAction<boolean>>
  setSelectedProjectGroupId: Dispatch<SetStateAction<string | null>>
  setSparseDirectories: Dispatch<SetStateAction<string>>
  setSparseEnabled: Dispatch<SetStateAction<boolean>>
  setSparseSelectedPresetId: Dispatch<SetStateAction<string | null>>
  setStartFromResetHint: Dispatch<SetStateAction<string | null>>
  startPointSelectionRef: RefObject<SmartGitHubPrStartPointSelection | null>
  workspaceHostScope: ExecutionHostScope
}

export function createComposerTargetActions(options: ComposerTargetActionsOptions) {
  const clearRepoScopedSource = (): void => {
    options.startPointSelectionRef.current = null
    options.setLinkedPR(null)
    options.setLinkedWorkItem(null)
    options.setBaseBranch(undefined)
    options.setCompareBaseRef(undefined)
    options.setPushTarget(undefined)
    options.setBranchNameOverride(undefined)
    options.setBranchNameOverridePreservesNameEdits(false)
    options.setReuseEligibleBranch(null)
    options.setReuseSelectedBranch(false)
    options.setForkPushWarning(null)
  }

  const handleRepoChange = (
    value: string,
    changeOptions: { preserveStartFrom?: boolean; forceResetStartFrom?: boolean } = {}
  ): void => {
    options.setProjectError(null)
    if (value === options.repoId && !changeOptions.forceResetStartFrom) {
      options.setRepoId(value)
      return
    }
    let hint: string | null = null
    if (!changeOptions.preserveStartFrom) {
      if (options.linkedWorkItem?.type === 'pr' && options.baseBranch) {
        hint = translate('auto.newWorkspace.target.wasPr', 'was PR #{number}', {
          number: options.linkedWorkItem.number
        })
      } else if (options.baseBranch) {
        hint = translate('auto.newWorkspace.target.wasBranch', 'was {branch}', {
          branch: options.baseBranch
        })
      }
    }
    options.setRepoId(value)
    if (!changeOptions.preserveStartFrom) {
      clearRepoScopedSource()
    }
    options.setSparseEnabled(false)
    options.setSparseDirectories('')
    options.setSparseSelectedPresetId(null)
    if (!changeOptions.preserveStartFrom) {
      options.setStartFromResetHint(hint)
    }
  }

  const handleFolderSourceRepoChange = (value: string): void => {
    if (!options.folderSourceRepos.some((repo) => repo.id === value)) {
      return
    }
    options.setRepoId(value)
    options.startPointSelectionRef.current = null
    options.setLinkedWorkItem((current) => {
      const provider = current ? getLinkedWorkItemProvider(current) : null
      return provider === 'github' ? null : current
    })
    options.setLinkedPR(null)
  }

  const handleProjectHostSetupChange = (setupId: string): void => {
    const option = options.projectHostSetupOptions.find((candidate) => candidate.id === setupId)
    if (!option || option.kind !== 'ready') {
      return
    }
    handleRepoChange(option.repoId, { preserveStartFrom: true })
  }

  const handleProjectChange = (projectId: string): void => {
    options.markInitialProjectGroupApplied()
    const projectGroupId = getProjectGroupIdFromNewWorkspaceOptionId(projectId)
    if (projectGroupId) {
      const group = options.projectGroups.find(
        (candidate) => candidate.id === projectGroupId && Boolean(candidate.parentPath?.trim())
      )
      if (!group) {
        options.setSelectedProjectGroupId(null)
        options.setProjectError(
          translate(
            'auto.hooks.useComposerState.chooseOrAddProjectBeforeWorkspace',
            'Choose or add a project before creating a workspace.'
          )
        )
        return
      }
      const sourceRepo = getFolderSourceRepos(options.repos, options.projectGroups, group)[0]
      options.setSelectedProjectGroupId(group.id)
      options.setProjectError(null)
      options.setRepoId(sourceRepo?.id ?? '')
      clearRepoScopedSource()
      options.setSparseEnabled(false)
      options.setSparseDirectories('')
      options.setSparseSelectedPresetId(null)
      options.setStartFromResetHint(null)
      return
    }

    options.setSelectedProjectGroupId(null)
    const preferredHostId =
      options.selectedWorkspaceTarget.status === 'ready'
        ? options.selectedWorkspaceTarget.target.hostId
        : null
    const nextRepoId = resolveWorkspaceCreationRepoId({
      eligibleRepos: options.eligibleRepos,
      projects: options.projects,
      projectHostSetups: options.projectHostSetups,
      projectId,
      focusedHostScope: preferredHostId ?? options.workspaceHostScope
    })
    if (nextRepoId) {
      handleRepoChange(nextRepoId, { forceResetStartFrom: options.isProjectGroupTarget })
    }
  }

  const showProjectRequiredError = (): void => {
    options.setProjectError(
      translate(
        'auto.hooks.useComposerState.chooseOrAddProjectBeforeWorkspace',
        'Choose or add a project before creating a workspace.'
      )
    )
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(
          '[data-contextual-tour-target="workspace-creation-project"] [data-project-combobox-root="true"][role="combobox"]'
        )
        ?.focus()
    })
  }

  const handleSparseSelectPreset = (preset: SparsePreset | null): void => {
    options.setSparseEnabled(Boolean(preset))
    options.setSparseDirectories(preset?.directories.join('\n') ?? '')
    options.setSparseSelectedPresetId(preset?.id ?? null)
  }

  return {
    handleFolderSourceRepoChange,
    handleProjectChange,
    handleProjectHostSetupChange,
    handleRepoChange,
    handleSparseSelectPreset,
    showProjectRequiredError
  }
}
