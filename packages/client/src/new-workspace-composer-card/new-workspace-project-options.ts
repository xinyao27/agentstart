import type { ProjectGroup } from '@agentstart/protocol/project/group-model'
import type { Project, ProjectHostSetup } from '@agentstart/protocol/project/model'
import type { Repo } from '@agentstart/protocol/project/repository'
import { projectHostSetupProjectionFromRepos } from '@agentstart/protocol/project/setup-projection'
import { isUtf8ByteLengthOverLimit } from '@agentstart/protocol/text/utf8-length'
import type { ExecutionHostRegistryEntry } from '~renderer/execution-host-registry'

import {
  getDuplicateProjectDetailsById,
  type ProjectSetupDirectory
} from './new-workspace-duplicate-project-details'

const NEW_WORKSPACE_PROJECT_GROUP_OPTION_PREFIX = 'project-group:'

export type NewWorkspaceProjectOption =
  | {
      kind: 'project'
      id: string
      projectId: string
      displayName: string
      badgeColor: string
      detail: string
    }
  | {
      kind: 'project-group'
      id: string
      projectGroupId: string
      displayName: string
      badgeColor: string
      detail: string
      parentPath: string
      connectionId: string | null
    }

type NewWorkspaceProjectOptionBase = {
  id: string
  displayName: string
  badgeColor: string
  detail: string
}

const NEW_WORKSPACE_PROJECT_OPTION_QUERY_MAX_BYTES = 2 * 1024

function isNewWorkspaceProjectOptionQueryTooLarge(
  query: string,
  maxBytes = NEW_WORKSPACE_PROJECT_OPTION_QUERY_MAX_BYTES
): boolean {
  return isUtf8ByteLengthOverLimit(query, maxBytes)
}

type BuildNewWorkspaceProjectOptionsInput = {
  projects: readonly Project[]
  projectHostSetups: readonly ProjectHostSetup[]
  eligibleRepos: readonly Repo[]
  hosts?: readonly Pick<ExecutionHostRegistryEntry, 'id' | 'label'>[]
}

type BuildNewWorkspaceCreateTargetOptionsInput = BuildNewWorkspaceProjectOptionsInput & {
  projectGroups: readonly ProjectGroup[]
}

function getProjectModel({
  projects,
  projectHostSetups,
  eligibleRepos
}: BuildNewWorkspaceProjectOptionsInput): {
  projects: readonly Project[]
  projectHostSetups: readonly ProjectHostSetup[]
} {
  if (projects.length > 0 || projectHostSetups.length > 0) {
    return { projects, projectHostSetups }
  }
  const projection = projectHostSetupProjectionFromRepos(eligibleRepos, Date.now())
  return {
    projects: projection.projects,
    projectHostSetups: projection.setups
  }
}

function getProjectDetail(project: Project, readySetupCount: number): string {
  if (project.providerIdentity) {
    return `${project.providerIdentity.owner}/${project.providerIdentity.repo}`
  }
  if (readySetupCount > 1) {
    return `${readySetupCount} hosts configured`
  }
  return 'Project'
}

function buildNewWorkspaceProjectOptions(
  input: BuildNewWorkspaceProjectOptionsInput
): NewWorkspaceProjectOption[] {
  const { eligibleRepos } = input
  const { projects, projectHostSetups } = getProjectModel(input)
  const eligibleRepoIds = new Set(eligibleRepos.map((repo) => repo.id))
  const hostLabelById = new Map((input.hosts ?? []).map((host) => [host.id, host.label]))
  const readySetupCountsByProjectId = new Map<string, number>()
  const setupDirectoriesByProjectId = new Map<string, ProjectSetupDirectory[]>()

  for (const setup of projectHostSetups) {
    if (setup.setupState !== 'ready' || !eligibleRepoIds.has(setup.repoId)) {
      continue
    }
    readySetupCountsByProjectId.set(
      setup.projectId,
      (readySetupCountsByProjectId.get(setup.projectId) ?? 0) + 1
    )
    const directories = setupDirectoriesByProjectId.get(setup.projectId) ?? []
    directories.push({ path: setup.path, hostId: setup.hostId })
    setupDirectoriesByProjectId.set(setup.projectId, directories)
  }

  const options = projects
    .filter((project) => (readySetupCountsByProjectId.get(project.id) ?? 0) > 0)
    .map((project) => ({
      kind: 'project' as const,
      id: project.id,
      projectId: project.id,
      displayName: project.displayName,
      badgeColor: project.badgeColor,
      detail: getProjectDetail(project, readySetupCountsByProjectId.get(project.id) ?? 0),
      detailSource: project.providerIdentity ? ('provider' as const) : ('generic' as const)
    }))

  const duplicateProjectDetailsById = getDuplicateProjectDetailsById(
    options,
    setupDirectoriesByProjectId,
    hostLabelById
  )

  return options
    .map(({ detailSource: _detailSource, ...option }) => {
      const directoryDetail = duplicateProjectDetailsById.get(option.id)
      return directoryDetail ? { ...option, detail: directoryDetail } : option
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.detail.localeCompare(b.detail))
}

function getProjectGroupOptionId(projectGroupId: string): string {
  return `${NEW_WORKSPACE_PROJECT_GROUP_OPTION_PREFIX}${projectGroupId}`
}

export function getProjectGroupIdFromNewWorkspaceOptionId(optionId: string): string | null {
  return optionId.startsWith(NEW_WORKSPACE_PROJECT_GROUP_OPTION_PREFIX)
    ? optionId.slice(NEW_WORKSPACE_PROJECT_GROUP_OPTION_PREFIX.length)
    : null
}

function getProjectGroupDetail(group: ProjectGroup): string {
  return group.parentPath?.trim() || 'Repo group'
}

export function buildNewWorkspaceCreateTargetOptions({
  projectGroups,
  ...projectInput
}: BuildNewWorkspaceCreateTargetOptionsInput): NewWorkspaceProjectOption[] {
  const projectOptions = buildNewWorkspaceProjectOptions(projectInput)
  const groupOptions = projectGroups
    .filter((group) => Boolean(group.parentPath?.trim()))
    .map((group) => ({
      kind: 'project-group' as const,
      id: getProjectGroupOptionId(group.id),
      projectGroupId: group.id,
      displayName: group.name,
      badgeColor: group.color ?? 'var(--muted-foreground)',
      detail: getProjectGroupDetail(group),
      parentPath: group.parentPath?.trim() ?? '',
      connectionId: group.connectionId ?? null
    }))

  return [...projectOptions, ...groupOptions].sort(
    (a, b) =>
      a.displayName.localeCompare(b.displayName) ||
      a.detail.localeCompare(b.detail) ||
      a.id.localeCompare(b.id)
  )
}

export function searchNewWorkspaceProjectOptions(
  options: readonly NewWorkspaceProjectOption[],
  rawQuery: string
): NewWorkspaceProjectOption[] {
  if (isNewWorkspaceProjectOptionQueryTooLarge(rawQuery)) {
    return []
  }
  const query = rawQuery.trim().toLowerCase()
  if (!query) {
    return [...options]
  }
  return options.filter((option: NewWorkspaceProjectOptionBase) =>
    [option.displayName, option.detail].some((value) => value.toLowerCase().includes(query))
  )
}
