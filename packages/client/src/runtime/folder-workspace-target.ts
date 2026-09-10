import {
  FOLDER_WORKSPACE_PROTOCOL_CAPABILITY,
  FolderWorkspaceClient,
  type FolderWorkspaceCreateInput,
  type FolderWorkspacePathStatusRequestInput,
  type FolderWorkspaceSelectorInput,
  type FolderWorkspaceUpdateInput
} from '@agentstart/protocol'
import { translate } from '~renderer/i18n/i18n'

import { openRuntimeProtocolTarget } from './protocol-target'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

async function openFolderWorkspaceProtocolTarget(
  target: RuntimeClientTarget
): Promise<FolderWorkspaceClient | null> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(FOLDER_WORKSPACE_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new FolderWorkspaceClient(await openRuntimeProtocolTarget(target))
}

// Why: the folder workspace namespace is protobuf-only, so a missing capability
// means the connected daemon predates the cutover — an error, not a legacy retry.
async function requireFolderWorkspaceProtocolClient(
  target: RuntimeClientTarget
): Promise<FolderWorkspaceClient> {
  const client = await openFolderWorkspaceProtocolTarget(target)
  if (!client) {
    throw new Error(
      translate(
        'runtime.folderWorkspaceTarget.unavailable',
        'This action needs a current AgentStart daemon connection.'
      )
    )
  }
  return client
}

export async function listRuntimeFolderWorkspaces(target: RuntimeClientTarget) {
  return (await requireFolderWorkspaceProtocolClient(target)).list({ timeoutMs: 15_000 })
}

export async function createRuntimeFolderWorkspace(
  target: RuntimeClientTarget,
  input: FolderWorkspaceCreateInput
) {
  return (await requireFolderWorkspaceProtocolClient(target)).create(input, { timeoutMs: 15_000 })
}

export async function updateRuntimeFolderWorkspace(
  target: RuntimeClientTarget,
  input: FolderWorkspaceUpdateInput
) {
  return (await requireFolderWorkspaceProtocolClient(target)).update(input, { timeoutMs: 15_000 })
}

export async function deleteRuntimeFolderWorkspace(
  target: RuntimeClientTarget,
  input: FolderWorkspaceSelectorInput
) {
  return (await requireFolderWorkspaceProtocolClient(target)).delete(input, { timeoutMs: 15_000 })
}

export async function getRuntimeFolderPathStatus(
  target: RuntimeClientTarget,
  request: FolderWorkspacePathStatusRequestInput
) {
  return (await requireFolderWorkspaceProtocolClient(target)).getPathStatus(request, {
    timeoutMs: 15_000
  })
}
