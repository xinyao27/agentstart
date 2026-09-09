import { LOCAL_EXECUTION_HOST_ID, toRuntimeExecutionHostId } from '@yiru/protocol/host/identity'
import type { Project, ProjectHostSetup } from '@yiru/protocol/project/model'
import type { Repo } from '@yiru/protocol/project/repository'
import { projectHostSetupProjectionFromRepos } from '@yiru/protocol/project/setup-projection'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'

export type ProjectProjection = {
  projects: Project[]
  setups: ProjectHostSetup[]
}

export type ProjectProjectionTarget = {
  fetchedProjects: readonly Project[]
  fetchedSetups: readonly ProjectHostSetup[]
  repos: readonly Repo[]
  target: RuntimeClientTarget
}

export function collectProjectProjection(
  targets: readonly ProjectProjectionTarget[]
): ProjectProjection {
  let projects: Project[] = []
  let setups: ProjectHostSetup[] = []
  for (const [index, targetCatalog] of targets.entries()) {
    const targetProjection = projectProjectionForTarget(targetCatalog)
    projects = mergeProjects(projects, targetProjection.projects, index > 0)
    setups = mergeSetups(setups, targetProjection.setups)
  }
  return { projects, setups }
}

function projectProjectionForTarget(input: ProjectProjectionTarget): ProjectProjection {
  const derived = projectHostSetupProjectionFromRepos(input.repos, Date.now())
  const fetchedSetups = input.fetchedSetups.map((setup) => setupForTarget(setup, input.target))
  return {
    projects: mergeProjects(derived.projects, input.fetchedProjects, false),
    setups: mergeSetups(derived.setups, fetchedSetups)
  }
}

function mergeProjects(
  base: readonly Project[],
  overlay: readonly Project[],
  preserveBaseRuntimePreference: boolean
): Project[] {
  const merged = [...base]
  const indexById = new Map(merged.map((project, index) => [project.id, index]))
  for (const project of overlay) {
    const index = indexById.get(project.id)
    if (index === undefined) {
      const inserted = { ...project }
      if (preserveBaseRuntimePreference) {
        delete inserted.localWindowsRuntimePreference
      }
      indexById.set(project.id, merged.length)
      merged.push(inserted)
      continue
    }
    const previous = merged[index]!
    const preference = previous.localWindowsRuntimePreference
    const next: Project = {
      ...previous,
      ...project,
      sourceRepoIds: [...new Set([...previous.sourceRepoIds, ...project.sourceRepoIds])],
      createdAt: Math.min(previous.createdAt, project.createdAt),
      updatedAt: Math.max(previous.updatedAt, project.updatedAt)
    }
    if (preserveBaseRuntimePreference) {
      if (preference === undefined) {
        delete next.localWindowsRuntimePreference
      } else {
        next.localWindowsRuntimePreference = preference
      }
    }
    merged[index] = next
  }
  return merged
}

function mergeSetups(
  base: readonly ProjectHostSetup[],
  overlay: readonly ProjectHostSetup[]
): ProjectHostSetup[] {
  const merged = [...base]
  const indexByOwner = new Map(merged.map((setup, index) => [setupOwnerKey(setup), index]))
  for (const setup of overlay) {
    const key = setupOwnerKey(setup)
    const index = indexByOwner.get(key)
    if (index === undefined) {
      indexByOwner.set(key, merged.length)
      merged.push(setup)
    } else {
      merged[index] = setup
    }
  }
  return merged
}

function setupOwnerKey(setup: ProjectHostSetup): string {
  return `${setup.hostId}:${setup.repoId || setup.id}`
}

function setupForTarget(setup: ProjectHostSetup, target: RuntimeClientTarget): ProjectHostSetup {
  const hostId =
    target.kind === 'local'
      ? LOCAL_EXECUTION_HOST_ID
      : toRuntimeExecutionHostId(target.environmentId)
  return setup.hostId === hostId && setup.executionHostId === hostId
    ? setup
    : { ...setup, hostId, executionHostId: hostId }
}
