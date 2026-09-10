import {
  NotebookClient,
  NOTEBOOK_PROTOCOL_CAPABILITY,
  type NotebookCellRunResult
} from '@agentstart/protocol'

import { openRuntimeProtocolTarget } from './protocol-target'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

export type NotebookRunPythonCellInput = {
  filePath: string
  code: string
  preamble?: string
}

// Why: the notebook namespace is protobuf-only, so a missing capability means
// the connected daemon predates the cutover — an error, not a legacy retry.
export async function runNotebookPythonCell(
  target: RuntimeClientTarget,
  input: NotebookRunPythonCellInput
): Promise<NotebookCellRunResult> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(NOTEBOOK_PROTOCOL_CAPABILITY)) {
    throw new Error('notebook.protobuf.v1 capability is not available')
  }
  const client = new NotebookClient(await openRuntimeProtocolTarget(target))
  return client.runPythonCell(input)
}
