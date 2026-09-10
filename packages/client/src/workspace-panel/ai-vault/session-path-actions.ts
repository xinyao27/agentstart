import {
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId
} from '@agentstart/protocol/host/identity'

export function canUseLocalAiVaultSessionPathActions(
  executionHostId: string | null | undefined
): boolean {
  // Why: local shell open/reveal APIs only validate paths on this computer;
  // SSH session history exposes paths that exist on the remote host instead.
  return normalizeExecutionHostId(executionHostId) === LOCAL_EXECUTION_HOST_ID
}

function isSyntheticAiVaultSessionPath(filePath: string): boolean {
  // Why: newer OpenCode sessions use a synthetic `<database>#<sessionId>`
  // scanner identity backed by SQLite — not a real filesystem path. A '#'
  // session marker never appears in a genuine local transcript path, so it is
  // a reliable v1 signal that there is no single file to open in AgentStart.
  return filePath.includes('#')
}

/**
 * Whether AI Vault `View Log` / `Open Log` can open this session's log inside
 * AgentStart as a read-only tab: a non-blank, local, single-file (non-synthetic)
 * path. Remote/runtime and synthetic identities are withheld until AI Vault has
 * a provider-owned log-resource contract.
 */
// Why: structural instead of the model `AiVaultSession` so protobuf session
// records (string execution host ids) flow through the same helpers.
export function canOpenAiVaultSessionLogInAgentStart(session: {
  executionHostId: string | null | undefined
  filePath: string | null | undefined
}): boolean {
  const filePath = session.filePath?.trim()
  if (!filePath) {
    return false
  }
  if (!canUseLocalAiVaultSessionPathActions(session.executionHostId)) {
    return false
  }
  return !isSyntheticAiVaultSessionPath(filePath)
}
