import { isWindowsAbsolutePathLike } from '@agentstart/protocol/host/path'
import { parseWslUncPath } from '@agentstart/protocol/host/wsl-paths'
import type { Project, ProjectHostSetup } from '@agentstart/protocol/project/model'
import type { Repo } from '@agentstart/protocol/project/repository'
import { getPortableProjectIdentityKey } from '@agentstart/protocol/project/setup-projection'

import type { ProjectGroupingModel } from './worktree-list/rows'

export type ProjectGroupingIndex = {
  projectById: Map<string, Project>
  setupByRepoId: Map<string, ProjectHostSetup>
  projectIdsRequiringSetupGroups: Set<string>
}

export type ProjectHeaderRevealTarget = {
  key: string
  label: string
  repo?: Repo
  projectId?: string
  projectIdentityKey?: string
}

const projectGroupingIndexCache = new WeakMap<ProjectGroupingModel, ProjectGroupingIndex | null>()

function isDistinctUserCheckout(setup: ProjectHostSetup): boolean {
  return setup.setupMethod !== 'provisioned'
}

function getProjectSetupSurfaceKey(setup: ProjectHostSetup): string {
  const wslPath = parseWslUncPath(setup.path)
  if (wslPath) {
    // Why: Windows and WSL on one machine are distinct execution surfaces.
    return `${setup.projectId}::${setup.hostId}::wsl:${wslPath.distro.toLowerCase()}`
  }
  if (isWindowsAbsolutePathLike(setup.path)) {
    return `${setup.projectId}::${setup.hostId}::windows-host`
  }
  return `${setup.projectId}::${setup.hostId}::default`
}

export function buildProjectGroupingIndex(
  model?: ProjectGroupingModel
): ProjectGroupingIndex | null {
  if (!model) {
    return null
  }
  const cached = projectGroupingIndexCache.get(model)
  if (cached !== undefined) {
    return cached
  }
  if (model.projects.length === 0 || model.projectHostSetups.length === 0) {
    projectGroupingIndexCache.set(model, null)
    return null
  }
  const checkoutsByProjectSurface = new Map<string, { projectId: string; count: number }>()
  for (const setup of model.projectHostSetups) {
    if (!isDistinctUserCheckout(setup)) {
      continue
    }
    const key = getProjectSetupSurfaceKey(setup)
    const existing = checkoutsByProjectSurface.get(key)
    if (existing) {
      existing.count += 1
    } else {
      checkoutsByProjectSurface.set(key, { projectId: setup.projectId, count: 1 })
    }
  }
  const projectIdsRequiringSetupGroups = new Set<string>()
  for (const { projectId, count } of checkoutsByProjectSurface.values()) {
    if (count > 1) {
      projectIdsRequiringSetupGroups.add(projectId)
    }
  }
  const index = {
    projectById: new Map(model.projects.map((project) => [project.id, project])),
    setupByRepoId: new Map(model.projectHostSetups.map((setup) => [setup.repoId, setup])),
    projectIdsRequiringSetupGroups
  }
  projectGroupingIndexCache.set(model, index)
  return index
}

export function getProjectGroupingForRepo(
  repoId: string,
  repoMap: Map<string, Repo>,
  projectIndex: ProjectGroupingIndex | null
): ProjectHeaderRevealTarget {
  const repo = repoMap.get(repoId)
  const setup = projectIndex?.setupByRepoId.get(repoId)
  const project = setup ? projectIndex?.projectById.get(setup.projectId) : undefined
  if (!setup || !project) {
    return { key: `repo:${repoId}`, label: repo?.displayName ?? 'Unknown', repo }
  }
  if (
    projectIndex?.projectIdsRequiringSetupGroups.has(setup.projectId) &&
    isDistinctUserCheckout(setup)
  ) {
    // Why: independent checkouts on one host surface need separate entries.
    return {
      key: `project:${project.id}::setup:${repoId}`,
      label: repo?.displayName ?? setup.displayName,
      repo,
      projectId: project.id,
      projectIdentityKey: getPortableProjectIdentityKey(project) ?? undefined
    }
  }
  return {
    key: `project:${project.id}`,
    label: project.displayName,
    repo,
    projectId: project.id,
    projectIdentityKey: getPortableProjectIdentityKey(project) ?? undefined
  }
}
