import type { AgentStatusClient } from '@yiru/protocol'
import type {
  AgentStatusIpcPayload,
  MigrationUnsupportedPtyEntry
} from '@yiru/protocol/agent/status-records'
import type { AgentInterruptInferenceRequest } from '~renderer/terminal-pane/agent/interrupt-intent'

import { openAgentStatusProtocolClient, requireAgentStatusClient } from './agent-status-target'

// Why: every PTY host funnels hooks back to the shell runtime's one agent-status
// authority. On web, the local adapter intentionally resolves to the paired host.

export async function getAgentStatusSnapshot(): Promise<AgentStatusIpcPayload[]> {
  return (await requireAgentStatusClient()).getSnapshot({ timeoutMs: 15_000 })
}

export async function getMigrationUnsupportedAgentStatusSnapshot(): Promise<
  MigrationUnsupportedPtyEntry[]
> {
  return (await requireAgentStatusClient()).getMigrationUnsupportedSnapshot({ timeoutMs: 15_000 })
}

export async function inferAgentStatusInterrupt(
  request: AgentInterruptInferenceRequest
): Promise<boolean> {
  return (await requireAgentStatusClient()).inferInterrupt(request, { timeoutMs: 15_000 })
}

export function dropAgentStatusOnHost(paneKey: string): void {
  dispatchAgentStatusMutation((client) => client.drop(paneKey))
}

export function dropAgentStatusesByTabPrefixOnHost(tabId: string): void {
  dispatchAgentStatusMutation((client) => client.dropByTabPrefix(tabId))
}

export function retireAgentPaneAuthorityOnHost(paneKey: string): void {
  dispatchAgentStatusMutation((client) => client.retirePaneAuthority(paneKey))
}

export function transferAgentPaneAuthorityOnHost(args: {
  fromPaneKey: string
  toPaneKey: string
  ptyId?: string
}): void {
  dispatchAgentStatusMutation((client) => client.transferPaneAuthority(args))
}

function dispatchAgentStatusMutation(mutate: (client: AgentStatusClient) => Promise<void>): void {
  void Promise.resolve()
    .then(async () => {
      const client = await openAgentStatusProtocolClient()
      if (!client) {
        return
      }
      await mutate(client)
    })
    .catch(() => {
      // Why: these mirror the old fire-and-forget IPC teardown messages. A
      // disconnect must not turn routine pane disposal into an unhandled rejection.
    })
}
