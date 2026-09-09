import type { ShellSessionDocumentValue, TerminalSummary } from '@yiru/protocol'
import type { WorkspaceSessionState } from '@yiru/protocol/workspace/session'
import { useAppStore } from '~renderer/store/state'
import { canonicalizeSessionTerminalIds } from '~renderer/terminal-identity/session'

import { openRuntimeTerminalClient } from '../terminal-protocol'

let terminals: readonly TerminalSummary[] = []

export async function prepareSessionProjection(
  _session: ShellSessionDocumentValue,
  hostId: string | undefined,
  signal: AbortSignal
): Promise<void> {
  if (hostId && hostId !== 'local') {
    return
  }
  const listed = await (
    await openRuntimeTerminalClient({ kind: 'local' })
  ).list({ limit: 10_000, requireFreshPtyLiveness: true }, { timeoutMs: 15_000, signal })
  if (listed.truncated) {
    throw new Error('workspace_session_terminal_list_truncated')
  }
  if (!signal.aborted) {
    terminals = listed.terminals
  }
}

export function projectTerminalIdentities(session: WorkspaceSessionState): WorkspaceSessionState {
  const remember = useAppStore.getState().rememberTerminalSessionId
  for (const terminal of terminals) {
    if (terminal.connected && terminal.ptyId) {
      remember(terminal.handle, terminal.ptyId, null)
    }
  }
  return canonicalizeSessionTerminalIds(session, terminals, null).session
}
