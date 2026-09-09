import {
  PROJECT_HOST_SETUP_PROTOCOL_CAPABILITY,
  PROJECT_CONTEXT_PROTOCOL_CAPABILITY
} from '@yiru/protocol'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId
} from '@yiru/protocol/host/identity'
import type { ProjectGroup } from '@yiru/protocol/project/group-model'
import type {
  ProjectHostSetup,
  ProjectHostSetupExistingFolderArgs
} from '@yiru/protocol/project/model'
import type { Repo } from '@yiru/protocol/project/repository'
import { translate } from '~renderer/i18n/i18n'
import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'
import {
  assertRuntimeEnvironmentCapability,
  getActiveRuntimeTarget
} from '~renderer/runtime/rpc-client'
import { shellClient } from '~renderer/runtime/shell-client'

import type { AppState } from '../../store/types'
import { getRuntimeTargetHostId } from './update-model'

export function getProjectSetupRuntimeTarget(
  hostId: ProjectHostSetupExistingFolderArgs['hostId']
): ReturnType<typeof getActiveRuntimeTarget> {
  const parsedHost = parseExecutionHostId(hostId)
  return parsedHost?.kind === 'runtime'
    ? { kind: 'environment', environmentId: parsedHost.environmentId }
    : { kind: 'local' }
}

export function getProjectUpdateRuntimeTarget(
  state: Pick<AppState, 'projectHostSetups' | 'settings'>,
  projectId: string
): ReturnType<typeof getActiveRuntimeTarget> {
  const target = getActiveRuntimeTarget(state.settings)
  if (target.kind !== 'environment') {
    return target
  }
  const runtimeHostId = getRuntimeTargetHostId(target)
  return state.projectHostSetups.some(
    (setup) => setup.projectId === projectId && setup.hostId === runtimeHostId
  )
    ? target
    : { kind: 'local' }
}

export function formatProjectPresenceProfileNames(profileNames: readonly string[]): string {
  const names = [...new Set(profileNames.map((name) => name.trim()).filter(Boolean))]
  if (names.length <= 3) {
    return names.join(', ')
  }
  // Why: the "+N more" overflow suffix is user-visible toast copy and must localize.
  return translate('auto.store.slices.repos.presenceProfileOverflow', '{{names}} +{{count}} more', {
    names: names.slice(0, 3).join(', '),
    count: names.length - 3
  })
}

export async function warnIfProjectKnownInAnotherProfile(
  repo: Repo,
  activeYiruProfileId: string | null
): Promise<void> {
  const findProjectProfiles = shellClient.yiruProfiles?.findProjectProfiles
  // Why: without a loaded active profile ID the scan cannot exclude the
  // current profile and would false-positive on the project just added.
  if (!findProjectProfiles || !activeYiruProfileId) {
    return
  }
  try {
    // Why: Repo.connectionId is dead — nothing sets it since remote hosts
    // were removed (#63) — a repo's profile-presence scan is always local.
    const result = await findProjectProfiles({
      path: repo.path,
      connectionId: null,
      executionHostId: getRepoExecutionHostId(repo),
      excludeProfileId: activeYiruProfileId
    })
    const description = formatProjectPresenceProfileNames(
      result.projects.map((project) => project.profileName)
    )
    if (!description) {
      return
    }
    publishRendererCommandResult({ type: 'repository-cross-profile-duplicate', description })
  } catch (err) {
    // Why: adding a project should not fail because an advisory profile scan failed.
    console.warn('Failed to check project presence in other profiles:', err)
  }
}

export function repoWithFetchedOwner(
  repo: Repo,
  target: ReturnType<typeof getActiveRuntimeTarget>
): Repo {
  if (target.kind === 'environment') {
    return { ...repo, executionHostId: getRuntimeTargetHostId(target) }
  }
  // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
  // removed (#63) — only executionHostId can still make a repo non-local.
  return repo.executionHostId ? repo : { ...repo, executionHostId: LOCAL_EXECUTION_HOST_ID }
}

export function projectGroupWithFetchedOwner(
  projectGroup: ProjectGroup,
  target: ReturnType<typeof getActiveRuntimeTarget>
): ProjectGroup {
  if (target.kind === 'environment') {
    return { ...projectGroup, executionHostId: getRuntimeTargetHostId(target) }
  }
  if (projectGroup.connectionId) {
    return { ...projectGroup, executionHostId: LOCAL_EXECUTION_HOST_ID }
  }
  return { ...projectGroup, executionHostId: LOCAL_EXECUTION_HOST_ID }
}

export function setupWithFetchedOwner(
  setup: ProjectHostSetup,
  target: ReturnType<typeof getActiveRuntimeTarget>
): ProjectHostSetup {
  const hostId = getRuntimeTargetHostId(target)
  if (target.kind !== 'environment' || setup.hostId !== LOCAL_EXECUTION_HOST_ID) {
    return setup
  }
  return {
    ...setup,
    hostId,
    executionHostId: hostId
  }
}

export async function assertProjectHostSetupRuntimeCapability(
  target: ReturnType<typeof getActiveRuntimeTarget>
): Promise<void> {
  if (target.kind !== 'environment') {
    return
  }
  await assertRuntimeEnvironmentCapability(
    target.environmentId,
    PROJECT_HOST_SETUP_PROTOCOL_CAPABILITY,
    translate(
      'runtime.projectSetup.unsupported',
      'The selected runtime host does not support project host setup yet. Update Yiru on the host and try again.'
    ),
    15_000
  )
}

export async function assertProjectHostSetupMutationRuntimeCapabilities(
  target: ReturnType<typeof getActiveRuntimeTarget>
): Promise<void> {
  if (target.kind !== 'environment') {
    return
  }
  await assertProjectHostSetupRuntimeCapability(target)
  await assertRuntimeEnvironmentCapability(
    target.environmentId,
    PROJECT_CONTEXT_PROTOCOL_CAPABILITY,
    translate(
      'runtime.projectContext.unsupported',
      'The selected runtime host does not support explicit workspace run hosts yet. Update Yiru on the host and try again.'
    ),
    15_000
  )
}
