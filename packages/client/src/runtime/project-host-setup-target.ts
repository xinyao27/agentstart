import {
  PROJECT_HOST_SETUP_PROTOCOL_CAPABILITY,
  ProjectHostSetupClient,
  type ProjectHostSetupCloneInput,
  type ProjectHostSetupCreateInput,
  type ProjectHostSetupDeleteInput,
  type ProjectHostSetupExistingFolderInput,
  type ProjectHostSetupListResultValue,
  type ProjectHostSetupMutationValue,
  type ProjectHostSetupUpdateInput
} from '@yiru/protocol'
import { translate } from '~renderer/i18n/i18n'

import { openRuntimeProtocolTarget } from './protocol-target'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

export async function openProjectHostSetupTarget(
  target: RuntimeClientTarget
): Promise<ProjectHostSetupClient | null> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(PROJECT_HOST_SETUP_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new ProjectHostSetupClient(await openRuntimeProtocolTarget(target))
}

// Why: the project host setup namespace is protobuf-only, so a missing
// capability means the connected daemon predates the cutover — an error, not a
// legacy retry.
export async function requireProjectHostSetupClient(
  target: RuntimeClientTarget
): Promise<ProjectHostSetupClient> {
  const client = await openProjectHostSetupTarget(target)
  if (!client) {
    throw new Error(
      translate(
        'runtime.projectHostSetupTarget.unavailable',
        'This action needs a current Yiru daemon connection.'
      )
    )
  }
  return client
}

export async function listRuntimeProjectHostSetups(
  target: RuntimeClientTarget
): Promise<ProjectHostSetupListResultValue> {
  return (await requireProjectHostSetupClient(target)).list({ timeoutMs: 15_000 })
}

export async function createRuntimeProjectHostSetup(
  target: RuntimeClientTarget,
  input: ProjectHostSetupCreateInput
): Promise<ProjectHostSetupMutationValue> {
  return (await requireProjectHostSetupClient(target)).create(input, { timeoutMs: 15_000 })
}

export async function setupExistingRuntimeProjectFolder(
  target: RuntimeClientTarget,
  input: ProjectHostSetupExistingFolderInput
): Promise<ProjectHostSetupMutationValue> {
  return (await requireProjectHostSetupClient(target)).setupExistingFolder(input, {
    timeoutMs: 15_000
  })
}

export async function cloneRuntimeProjectRepository(
  target: RuntimeClientTarget,
  input: ProjectHostSetupCloneInput
): Promise<ProjectHostSetupMutationValue> {
  return (await requireProjectHostSetupClient(target)).clone(input, { timeoutMs: 15_000 })
}

export async function updateRuntimeProjectHostSetup(
  target: RuntimeClientTarget,
  input: ProjectHostSetupUpdateInput
): Promise<ProjectHostSetupMutationValue> {
  return (await requireProjectHostSetupClient(target)).update(input, { timeoutMs: 15_000 })
}

export async function deleteRuntimeProjectHostSetup(
  target: RuntimeClientTarget,
  input: ProjectHostSetupDeleteInput
): Promise<ProjectHostSetupMutationValue> {
  return (await requireProjectHostSetupClient(target)).delete(input, { timeoutMs: 15_000 })
}
