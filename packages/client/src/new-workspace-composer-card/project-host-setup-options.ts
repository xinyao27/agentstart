import {
  PROJECT_HOST_SETUP_PROTOCOL_CAPABILITY,
  PROJECT_CONTEXT_PROTOCOL_CAPABILITY
} from '@yiru/protocol'
import { LOCAL_EXECUTION_HOST_ID, type ExecutionHostId } from '@yiru/protocol/host/identity'
import type { ProjectHostSetup } from '@yiru/protocol/project/model'
import type { Repo } from '@yiru/protocol/project/repository'
import type { ExecutionHostRegistryEntry } from '~renderer/execution-host-registry'
import { getExecutionHostLabel } from '~renderer/execution-host/labels'
import { translate } from '~renderer/i18n/i18n'

export type ProjectHostSetupOption =
  | {
      id: string
      kind: 'ready'
      projectId: string
      hostId: ExecutionHostId
      repoId: string
      label: string
      detail: string
      path: string
    }
  | {
      id: string
      kind: 'needs-setup'
      projectId: string
      hostId: ExecutionHostId
      label: string
      detail: string
      isAvailable: boolean
    }

export type ReadyProjectHostSetupOption = Extract<ProjectHostSetupOption, { kind: 'ready' }>

export type NeedsSetupProjectHostOption = Extract<ProjectHostSetupOption, { kind: 'needs-setup' }>

type BuildReadySetupOptionsInput = {
  projectId: string
  projectHostSetups: readonly ProjectHostSetup[]
  eligibleRepos: readonly Repo[]
  hosts: readonly ExecutionHostRegistryEntry[]
}

type BuildNeedsSetupOptionsInput = {
  projectId: string
  hosts: readonly ExecutionHostRegistryEntry[]
  readySetupByHost: ReadonlyMap<ExecutionHostId, ReadyProjectHostSetupOption>
  pendingSetupByHost: ReadonlyMap<ExecutionHostId, ProjectHostSetup>
}

type BuildProjectHostSetupOptionsInput = {
  projectId: string | null
  projectHostSetups: readonly ProjectHostSetup[]
  eligibleRepos: readonly Repo[]
  hosts?: readonly ExecutionHostRegistryEntry[]
}

export function buildProjectHostSetupOptions({
  projectId,
  projectHostSetups,
  eligibleRepos,
  hosts = []
}: BuildProjectHostSetupOptionsInput): ProjectHostSetupOption[] {
  if (!projectId) {
    return []
  }
  const readyOptions = buildReadySetupOptions({
    projectId,
    projectHostSetups,
    eligibleRepos,
    hosts
  })
  const readySetupByHost = new Map(readyOptions.map((option) => [option.hostId, option]))
  const pendingSetupByHost = getPendingSetupByHost(projectId, projectHostSetups)
  return [
    ...readyOptions,
    ...buildNeedsSetupOptions({
      projectId,
      hosts,
      readySetupByHost,
      pendingSetupByHost
    })
  ].sort((a, b) => compareProjectHostSetupOptions(a, b))
}

function getPendingSetupByHost(
  projectId: string,
  projectHostSetups: readonly ProjectHostSetup[]
): Map<ExecutionHostId, ProjectHostSetup> {
  const setups = new Map<ExecutionHostId, ProjectHostSetup>()
  for (const setup of projectHostSetups) {
    if (setup.projectId !== projectId || setup.setupState === 'ready') {
      continue
    }
    if (!setups.has(setup.hostId)) {
      setups.set(setup.hostId, setup)
    }
  }
  return setups
}

function buildReadySetupOptions({
  projectId,
  projectHostSetups,
  eligibleRepos,
  hosts
}: BuildReadySetupOptionsInput): ReadyProjectHostSetupOption[] {
  const eligibleRepoIds = new Set(eligibleRepos.map((repo) => repo.id))
  const hostById = new Map(hosts.map((host) => [host.id, host]))
  return projectHostSetups
    .filter(
      (setup) =>
        setup.projectId === projectId &&
        setup.setupState === 'ready' &&
        eligibleRepoIds.has(setup.repoId)
    )
    .map((setup) => ({
      id: setup.id,
      kind: 'ready' as const,
      projectId: setup.projectId,
      hostId: setup.hostId,
      repoId: setup.repoId,
      label: hostById.get(setup.hostId)?.label || getExecutionHostLabel(setup.hostId),
      detail: setup.displayName,
      path: setup.path
    }))
}

function buildNeedsSetupOptions({
  projectId,
  hosts,
  readySetupByHost,
  pendingSetupByHost
}: BuildNeedsSetupOptionsInput): NeedsSetupProjectHostOption[] {
  return hosts
    .filter((host) => !readySetupByHost.has(host.id))
    .map((host) => {
      const pendingSetup = pendingSetupByHost.get(host.id)
      const availability = getHostSetupAvailability(host)
      return {
        id: `needs-setup:${host.id}`,
        kind: 'needs-setup' as const,
        projectId,
        hostId: host.id,
        label: host.label || getExecutionHostLabel(host.id),
        detail: availability.isAvailable
          ? pendingSetup
            ? getPendingSetupDetail(pendingSetup)
            : translate('project.hostSetup.notSetUp', 'Project not set up on this host')
          : availability.detail,
        isAvailable: availability.isAvailable
      }
    })
}

function getHostSetupAvailability(host: ExecutionHostRegistryEntry): {
  isAvailable: boolean
  detail: string
} {
  if (host.health === 'blocked') {
    return {
      isAvailable: false,
      detail: translate('project.hostSetup.incompatible', 'Runtime host version is incompatible')
    }
  }
  if (host.kind === 'runtime') {
    if (!host.capabilities) {
      return {
        isAvailable: false,
        detail: translate('project.hostSetup.checking', 'Checking host capabilities')
      }
    }
    if (
      !host.capabilities.includes(PROJECT_HOST_SETUP_PROTOCOL_CAPABILITY) ||
      !host.capabilities.includes(PROJECT_CONTEXT_PROTOCOL_CAPABILITY)
    ) {
      return {
        isAvailable: false,
        detail: translate(
          'project.hostSetup.upgrade',
          'Update Yiru on this host to set up projects'
        )
      }
    }
  }
  return {
    isAvailable: true,
    detail: ''
  }
}

function getPendingSetupDetail(setup: ProjectHostSetup): string {
  switch (setup.setupState) {
    case 'not-set-up':
      return translate('project.hostSetup.tracked', 'Project tracked on this host but not set up')
    case 'setting-up':
      return translate('project.hostSetup.progress', 'Project setup is in progress')
    case 'error':
      return translate('project.hostSetup.attention', 'Project setup needs attention')
    case 'unsupported':
      return translate('project.hostSetup.unsupported', 'Project is unsupported on this host')
    case 'ready':
      return setup.path
  }
}

function compareProjectHostSetupOptions(
  a: ProjectHostSetupOption,
  b: ProjectHostSetupOption
): number {
  if (a.hostId === LOCAL_EXECUTION_HOST_ID && b.hostId !== LOCAL_EXECUTION_HOST_ID) {
    return -1
  }
  if (b.hostId === LOCAL_EXECUTION_HOST_ID && a.hostId !== LOCAL_EXECUTION_HOST_ID) {
    return 1
  }
  const aDetail = a.kind === 'ready' ? a.path : a.detail
  const bDetail = b.kind === 'ready' ? b.path : b.detail
  return a.label.localeCompare(b.label) || aDetail.localeCompare(bDetail)
}
