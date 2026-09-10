import {
  WORKSPACE_SPACE_PROTOCOL_CAPABILITY,
  WorkspaceSpaceClient,
  type WorkspaceSpaceAnalyzeResultValue
} from '@agentstart/protocol'
import { useAppStore } from '~renderer/store/state'

import { openRuntimeProtocolTarget } from './protocol-target'
import { getActiveRuntimeTarget } from './rpc-client'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

function activeWorkspaceSpaceTarget(): RuntimeClientTarget {
  return getActiveRuntimeTarget(useAppStore.getState().settings)
}

export async function analyzeWorkspaceSpace(): Promise<WorkspaceSpaceAnalyzeResultValue> {
  const client = await requireWorkspaceSpaceClient(activeWorkspaceSpaceTarget())
  return client.analyze()
}

export async function cancelWorkspaceSpaceScan(): Promise<boolean> {
  const client = await requireWorkspaceSpaceClient(activeWorkspaceSpaceTarget())
  const result = await client.cancel()
  return result.cancelled
}

// Why: the workspace space namespace is protobuf-only, so a missing capability
// means the connected daemon predates the cutover — an error, not a legacy
// retry.
async function requireWorkspaceSpaceClient(
  target: RuntimeClientTarget
): Promise<WorkspaceSpaceClient> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(WORKSPACE_SPACE_PROTOCOL_CAPABILITY)) {
    throw new Error('workspaceSpace.protobuf.v1 capability is not available')
  }
  return new WorkspaceSpaceClient(await openRuntimeProtocolTarget(target))
}
