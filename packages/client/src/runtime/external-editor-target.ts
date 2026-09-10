import {
  EXTERNAL_EDITOR_PROTOCOL_CAPABILITY,
  ExternalEditorClient,
  type ExternalEditorOpenRemoteSshResult
} from '@agentstart/protocol'

import { openRuntimeProtocolTarget } from './protocol-target'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

export type ExternalEditorOpenRemoteSshInput = {
  path: string
  command?: string
  connectionId: string
}

// Why: the external editor namespace is protobuf-only, so a missing capability
// means the connected daemon predates the cutover — an error, not a legacy
// retry. Remote-SSH launching is runtime-routed, so the target follows the
// workspace's active environment.
export async function openRemoteSshInExternalEditor(
  target: RuntimeClientTarget,
  input: ExternalEditorOpenRemoteSshInput
): Promise<ExternalEditorOpenRemoteSshResult> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(EXTERNAL_EDITOR_PROTOCOL_CAPABILITY)) {
    throw new Error('externalEditor.protobuf.v1 capability is not available')
  }
  const client = new ExternalEditorClient(await openRuntimeProtocolTarget(target))
  return client.openRemoteSsh(input)
}
