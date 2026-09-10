import {
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId,
  type ExecutionHostId
} from '@agentstart/protocol/host/identity'
import type { WorkspaceSessionState } from '@agentstart/protocol/workspace/session'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'
import { openRuntimeTerminalClient } from '~renderer/runtime/terminal-protocol'
import { useAppStore } from '~renderer/store/state'

import {
  canonicalizeSessionTerminalIds,
  hasCanonicalizableSessionTerminalIds,
  persistenceSessionTerminalIds,
  type SessionTerminalIdFields
} from './session'

const TERMINAL_ID_EXCHANGE_LIMIT = 10_000

function targetForSessionHost(hostId: ExecutionHostId): RuntimeClientTarget {
  const parsed = parseExecutionHostId(hostId)
  return parsed?.kind === 'runtime'
    ? { kind: 'environment', environmentId: parsed.environmentId }
    : { kind: 'local' }
}

export async function exchangePersistedWorkspaceSessionTerminalIds(
  session: WorkspaceSessionState,
  hostId: ExecutionHostId = LOCAL_EXECUTION_HOST_ID
): Promise<WorkspaceSessionState> {
  if (!hasCanonicalizableSessionTerminalIds(session)) {
    return session
  }
  const target = targetForSessionHost(hostId)
  const listed = await (
    await openRuntimeTerminalClient(target)
  ).list(
    { limit: TERMINAL_ID_EXCHANGE_LIMIT, requireFreshPtyLiveness: true },
    { timeoutMs: 15_000 }
  )
  if (listed.truncated) {
    throw new Error('workspace_session_terminal_list_truncated')
  }
  const environmentId = target.kind === 'environment' ? target.environmentId : null
  const rememberTerminalSessionId = useAppStore.getState().rememberTerminalSessionId
  for (const terminal of listed.terminals) {
    if (terminal.connected && terminal.ptyId) {
      rememberTerminalSessionId(terminal.handle, terminal.ptyId, environmentId)
    }
  }
  const canonicalized = canonicalizeSessionTerminalIds(session, listed.terminals, environmentId)
  console.info(
    `[session] exchanged ${canonicalized.exchangedIdCount} terminal ids; retired ${canonicalized.retiredIdCount} stale ids`
  )
  return canonicalized.session
}

export function prepareWorkspaceSessionTerminalIdsForPersistence(
  fields: SessionTerminalIdFields
): SessionTerminalIdFields {
  return persistenceSessionTerminalIds(fields, useAppStore.getState().terminalSessionIdIndex)
}
