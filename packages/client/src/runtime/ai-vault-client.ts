import { AI_VAULT_PROTOCOL_CAPABILITY, AiVaultClient } from '@agentstart/protocol'
import type { AiVaultSessionRecord } from '@agentstart/protocol'
import { limitAiVaultScopePaths } from '~renderer/workspace-panel/ai-vault/scope-paths'
import type {
  AiVaultListResult,
  AiVaultScanIssue,
  AiVaultSession
} from '~renderer/workspace-panel/ai-vault/session/record'
import type { AiVaultSubagentListArgs } from '~renderer/workspace-panel/ai-vault/session/record'

import {
  openConfiguredBrowserHostProtocol,
  readConfiguredBrowserHostStatus
} from './browser-host-runtime'

export type AiVaultListInput = {
  compact?: boolean
  executionHostId?: string
  executionHostScope?: string
  force?: boolean
  limit?: number
  scopePaths?: readonly string[]
}

export async function listAiVaultSessions(input: AiVaultListInput): Promise<AiVaultListResult> {
  const client = await requireAiVaultClient()
  const result = await client.listSessions({
    compact: input.compact,
    executionHostId: input.executionHostId,
    executionHostScope: input.executionHostScope,
    force: input.force,
    limit: input.limit,
    scopePaths: limitAiVaultScopePaths(input.scopePaths)
  })
  // Why: the protobuf record types keep open fields (plain agent names and
  // execution-host strings) where the shell's vault model carries narrow
  // unions; the daemon only ever emits values inside those unions, so the
  // decoded records reattach the model types at this one boundary.
  return {
    issues: result.issues as AiVaultScanIssue[],
    scannedAt: result.scannedAt,
    sessions: result.sessions as unknown as AiVaultSession[]
  }
}

export type AiVaultSubagentListResult = {
  sessions: AiVaultSessionRecord[]
}

export type AiVaultSubagentListInput = AiVaultSubagentListArgs

export async function listAiVaultSubagentSessions(
  input: AiVaultSubagentListInput
): Promise<AiVaultSubagentListResult> {
  const client = await requireAiVaultClient()
  const result = await client.listSubagentSessions({
    agent: input.agent,
    executionHostId: input.executionHostId,
    parentFilePath: input.parentFilePath
  })
  return { sessions: result.sessions }
}

// Why: the aiVault namespace is protobuf-only, so a missing capability means
// the connected daemon predates the cutover — an error, not a legacy retry.
async function requireAiVaultClient(): Promise<AiVaultClient> {
  const status = await readConfiguredBrowserHostStatus()
  if (!status.capabilities?.includes(AI_VAULT_PROTOCOL_CAPABILITY)) {
    throw new Error('aiVault.protobuf.v1 capability is not available on this runtime host')
  }
  return new AiVaultClient(await openConfiguredBrowserHostProtocol())
}
