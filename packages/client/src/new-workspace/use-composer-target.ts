import { parseExecutionHostId } from '@yiru/protocol/host/identity'
import { resolveLocalWindowsAgentStartupShell } from '@yiru/protocol/host/windows-terminal-shell'
import { isGitRepoKind } from '@yiru/protocol/project/repository'
import { isWorkspaceStatusId } from '@yiru/protocol/workspace/status/normalize'
import { useState } from 'react'
import { getAgentLaunchPlatformForRepo } from '~renderer/agent/launch-platform'
import { useDetectedAgents } from '~renderer/agent/use-detected'
import { buildExecutionHostRegistry } from '~renderer/execution-host-registry'
import { getHostDisplayLabelOverrides } from '~renderer/host-setting-overrides'
import { buildNewWorkspaceCreateTargetOptions } from '~renderer/new-workspace-composer-card/new-workspace-project-options'
import { buildProjectHostSetupOptions } from '~renderer/new-workspace-composer-card/project-host-setup-options'
import { getLocalRepoProjectExecutionRuntimeContext } from '~renderer/preflight/context'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { projectCatalogRepoBuckets } from '~renderer/project-catalog/repo-buckets'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { getSettingsForRepoRuntimeOwner } from '~renderer/repo/runtime-owner'
import { getFolderSourceRepos } from '~renderer/sidebar/folder-workspace-composer-model'
import { useFolderWorkspaceComposerPathStatus } from '~renderer/sidebar/folder-workspace-composer-path-status'
import { useAppStore } from '~renderer/store/state'

import type { UseComposerStateOptions } from './composer-contract'
import { resolveInitialWorkspaceRunSeed } from './composer-initial-state'
import { getComposerEligibleRepos } from './composer-repo'
import {
  resolveWorkspaceCreationRepoId,
  resolveWorkspaceCreationTarget
} from './project-host-workspace-target'
import { CLIENT_PLATFORM } from './workspace-creation'

type UseComposerTargetOptions = Pick<
  UseComposerStateOptions,
  | 'initialProjectGroupId'
  | 'initialProjectSourceContext'
  | 'initialRepoId'
  | 'initialWorkspaceStatus'
  | 'onRepoIdOverrideChange'
  | 'persistDraft'
  | 'repoIdOverride'
>

export function useComposerTarget(options: UseComposerTargetOptions) {
  const catalog = useProjectCatalog()
  const { projectGroups, projectHostSetups, projects, repos, runtimeEnvironments } = catalog
  const activeRepoId = useAppStore((state) => state.activeRepoId)
  const settings = useAppStore((state) => state.settings)
  const newWorkspaceDraft = useAppStore((state) => state.newWorkspaceDraft)
  const sparsePresetsByRepo = useAppStore((state) => state.sparsePresetsByRepo)
  const workspaceStatuses = useAppStore((state) => state.workspaceStatuses)
  const runtimeStatusByEnvironmentId = useAppStore((state) => state.runtimeStatusByEnvironmentId)
  const workspaceHostScope = useAppStore((state) => state.workspaceHostScope)
  const { worktreesByRepo } = projectCatalogRepoBuckets(catalog)
  const eligibleRepos = getComposerEligibleRepos(repos)
  const draft = options.persistDraft ? newWorkspaceDraft : null
  const initialRunSeed = resolveInitialWorkspaceRunSeed({
    draftProjectId: draft?.projectId ?? null,
    draftHostId: draft?.hostId ?? null,
    draftProjectHostSetupId: draft?.projectHostSetupId ?? null,
    initialProjectSourceContext: options.initialProjectSourceContext
  })
  const workspaceStatus =
    options.initialWorkspaceStatus &&
    isWorkspaceStatusId(options.initialWorkspaceStatus, workspaceStatuses)
      ? options.initialWorkspaceStatus
      : undefined
  const initialRepoId = resolveWorkspaceCreationRepoId({
    eligibleRepos,
    projects,
    projectHostSetups,
    draftRepoId: draft?.repoId ?? null,
    initialRepoId: options.initialRepoId,
    activeRepoId: activeRepoId ?? null,
    projectId: initialRunSeed.projectId,
    hostId: initialRunSeed.hostId,
    projectHostSetupId: initialRunSeed.projectHostSetupId,
    focusedHostScope: workspaceHostScope
  })
  const [internalRepoId, setInternalRepoId] = useState(initialRepoId)
  const initialProjectGroupId = options.initialProjectGroupId ?? draft?.projectGroupId ?? null
  const initialProjectGroup = projectGroups.find(
    (group) => group.id === initialProjectGroupId && Boolean(group.parentPath?.trim())
  )
  const [selectedProjectGroupId, setSelectedProjectGroupId] = useState<string | null>(
    initialProjectGroup?.id ?? null
  )
  const [hasAppliedInitialProjectGroup, setHasAppliedInitialProjectGroup] = useState(
    Boolean(initialProjectGroup)
  )
  const [projectError, setProjectError] = useState<string | null>(null)
  const repoId = options.repoIdOverride ?? internalRepoId
  const selectedProjectGroup = selectedProjectGroupId
    ? (projectGroups.find(
        (group) => group.id === selectedProjectGroupId && Boolean(group.parentPath?.trim())
      ) ?? null)
    : null

  if (!selectedProjectGroupId && initialProjectGroupId && !hasAppliedInitialProjectGroup) {
    const group = projectGroups.find(
      (candidate) => candidate.id === initialProjectGroupId && Boolean(candidate.parentPath?.trim())
    )
    if (group) {
      setHasAppliedInitialProjectGroup(true)
      setSelectedProjectGroupId(group.id)
    }
  }

  const folderSourceRepos = getFolderSourceRepos(repos, projectGroups, selectedProjectGroup)
  const parsedFolderHost = parseExecutionHostId(selectedProjectGroup?.executionHostId)
  const folderRuntimeEnvironmentId =
    parsedFolderHost?.kind === 'runtime' ? parsedFolderHost.environmentId : null
  const folderTarget = folderRuntimeEnvironmentId
    ? { kind: 'runtime' as const, environmentId: folderRuntimeEnvironmentId }
    : selectedProjectGroup
      ? { kind: 'local' as const }
      : undefined
  const folderPathStatus = useFolderWorkspaceComposerPathStatus(
    selectedProjectGroup,
    true,
    folderRuntimeEnvironmentId
  )
  const { detectedIds: folderDetectedIds } = useDetectedAgents(folderTarget)
  const selectedWorkspaceTarget = resolveWorkspaceCreationTarget({
    eligibleRepos,
    projects,
    projectHostSetups,
    draftRepoId: repoId,
    focusedHostScope: workspaceHostScope
  })
  const selectedRepo = eligibleRepos.find((repo) => repo.id === repoId)
  const selectedRepoIsGit = selectedRepo ? isGitRepoKind(selectedRepo) : false
  const agentPlatform = selectedRepo
    ? getAgentLaunchPlatformForRepo(
        getLocalRepoProjectExecutionRuntimeContext(
          { activeRepoId, activeWorktreeId: null, projects, repos, settings, worktreesByRepo },
          selectedRepo.id,
          CLIENT_PLATFORM
        )
      )
    : CLIENT_PLATFORM
  const startupShell = resolveLocalWindowsAgentStartupShell({
    platform: agentPlatform,
    isRemote: false,
    terminalWindowsShell: settings?.terminalWindowsShell
  })
  const selectedProjectId =
    selectedWorkspaceTarget.status === 'ready' ? selectedWorkspaceTarget.target.projectId : null
  const hosts = buildExecutionHostRegistry({
    repos,
    settings,
    runtimeEnvironments,
    runtimeStatusByEnvironmentId,
    hostLabelOverrides: getHostDisplayLabelOverrides(settings)
  })
  const repoSettings = settings
    ? getSettingsForRepoRuntimeOwner(
        { repos: selectedRepo ? [selectedRepo] : [], settings },
        selectedRepo?.id ?? null
      )
    : settings
  const setRepoId = useEventCallback((value: string) => {
    if (options.onRepoIdOverrideChange) {
      options.onRepoIdOverrideChange(value)
    } else {
      setInternalRepoId(value)
    }
  })
  const markInitialProjectGroupApplied = (): void => {
    setHasAppliedInitialProjectGroup(true)
  }

  return {
    agentPlatform,
    eligibleRepos,
    folderDetectedAgentIds: folderDetectedIds ? new Set(folderDetectedIds) : null,
    folderPathStatus,
    folderRuntimeEnvironmentId,
    folderSourceRepos,
    markInitialProjectGroupApplied,
    isProjectGroupTarget: selectedProjectGroup !== null,
    newWorkspaceDraft,
    projectError,
    projectGroups,
    projectHostSetupOptions: buildProjectHostSetupOptions({
      projectId: selectedProjectId,
      projectHostSetups,
      eligibleRepos,
      hosts
    }),
    projectHostSetups,
    projectOptions: buildNewWorkspaceCreateTargetOptions({
      projects,
      projectHostSetups,
      eligibleRepos,
      projectGroups,
      hosts
    }),
    projects,
    repoId,
    repos,
    repoSettings,
    selectedProjectGroup,
    selectedProjectHostSetupId:
      !selectedProjectGroup && selectedWorkspaceTarget.status === 'ready'
        ? selectedWorkspaceTarget.target.projectHostSetupId
        : null,
    selectedProjectId: selectedProjectGroup
      ? `project-group:${selectedProjectGroup.id}`
      : selectedProjectId,
    selectedRepo,
    selectedRepoIsGit,
    selectedWorkspaceTarget,
    setProjectError,
    setRepoId,
    setSelectedProjectGroupId,
    settings,
    sparsePresetsByRepo,
    startupShell,
    workspaceHostScope,
    workspaceStatus,
    worktreesByRepo
  }
}
