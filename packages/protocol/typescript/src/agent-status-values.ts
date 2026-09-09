import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  AgentMigrationUnsupportedSource,
  AgentProviderSessionKey,
  AgentStatusState,
  AgentSubagentState,
  type AgentMigrationUnsupportedPtyEntry,
  type AgentStatusSnapshotEntry,
  type AgentStatusSubagent
} from '../generated/yiru/runtime/v1/agent_status_pb.js'
import { RuntimeProtocolError } from './error.js'

export const AGENT_STATUS_PROTOCOL_CAPABILITY = 'agentStatus.protobuf.v1' as const

export type AgentStatusStateValue = 'working' | 'blocked' | 'waiting' | 'done'
export type AgentSubagentStateValue = 'working' | 'blocked' | 'waiting' | 'idle'
export type AgentProviderSessionKeyValue = 'session_id' | 'conversation_id'

export type AgentStatusProviderSessionValue = {
  key: AgentProviderSessionKeyValue
  id: string
  transcriptPath?: string
}

export type AgentStatusSubagentValue = {
  id: string
  state: AgentSubagentStateValue
  startedAt: number
  agentType?: string
  model?: string
  description?: string
}

export type AgentStatusSnapshotEntryValue = {
  state: AgentStatusStateValue
  prompt: string
  paneKey: string
  connectionId: string | null
  receivedAt: number
  stateStartedAt: number
  launchToken?: string
  terminalHandle?: string
  tabId?: string
  worktreeId?: string
  agentType?: string
  model?: string
  toolName?: string
  toolInput?: string
  interactivePrompt?: string
  lastAssistantMessage?: string
  interrupted?: boolean
  subagents?: AgentStatusSubagentValue[]
  providerSession?: AgentStatusProviderSessionValue
  providerSessionOnly?: boolean
  promptInteractionKey?: string
}

export type MigrationUnsupportedPtyEntryValue = {
  ptyId: string
  worktreeId?: string
  tabId?: string
  leafId?: string
  paneKey?: string
  reason: 'legacy-numeric-pane-key'
  source: 'local' | 'ssh'
  updatedAt: number
}

export type AgentStatusHostSnapshotValue = {
  statuses: AgentStatusSnapshotEntryValue[]
  migrationUnsupportedPtys: MigrationUnsupportedPtyEntryValue[]
}

export type AgentStatusStreamEventValue =
  | { type: 'ready'; subscriptionId: string; snapshot: AgentStatusHostSnapshotValue }
  | { type: 'set'; status: AgentStatusSnapshotEntryValue }
  | { type: 'clear'; paneKey: string }
  | { type: 'migrationUnsupported'; entry: MigrationUnsupportedPtyEntryValue }
  | { type: 'migrationUnsupportedClear'; ptyId: string }

// ─── Decoding ───────────────────────────────────────────────────────────────

export function agentStatusEntry(value: AgentStatusSnapshotEntry): AgentStatusSnapshotEntryValue {
  return {
    paneKey: value.paneKey,
    state: state(value.state),
    prompt: value.prompt,
    connectionId: connectionId(value.connectionId),
    receivedAt: Number(value.receivedAt),
    stateStartedAt: Number(value.stateStartedAt),
    ...(value.launchToken === undefined ? {} : { launchToken: value.launchToken }),
    ...(value.tabId === undefined ? {} : { tabId: value.tabId }),
    ...(value.worktreeId === undefined ? {} : { worktreeId: value.worktreeId }),
    ...(value.agentType === undefined ? {} : { agentType: value.agentType }),
    ...(value.model === undefined ? {} : { model: value.model }),
    ...(value.toolName === undefined ? {} : { toolName: value.toolName }),
    ...(value.toolInput === undefined ? {} : { toolInput: value.toolInput }),
    ...(value.interactivePrompt === undefined
      ? {}
      : { interactivePrompt: value.interactivePrompt }),
    ...(value.lastAssistantMessage === undefined
      ? {}
      : { lastAssistantMessage: value.lastAssistantMessage }),
    ...(value.interrupted === undefined ? {} : { interrupted: value.interrupted }),
    ...(value.subagents.length > 0 ? { subagents: value.subagents.map(subagent) } : {}),
    ...(value.providerSession
      ? {
          providerSession: {
            key: providerSessionKey(value.providerSession.key),
            id: value.providerSession.id,
            ...(value.providerSession.transcriptPath === undefined
              ? {}
              : { transcriptPath: value.providerSession.transcriptPath })
          }
        }
      : {}),
    ...(value.providerSessionOnly === undefined
      ? {}
      : { providerSessionOnly: value.providerSessionOnly }),
    ...(value.promptInteractionKey === undefined
      ? {}
      : { promptInteractionKey: value.promptInteractionKey })
  }
}

export function migrationUnsupportedEntry(
  value: AgentMigrationUnsupportedPtyEntry
): MigrationUnsupportedPtyEntryValue {
  return {
    ptyId: value.ptyId,
    reason: 'legacy-numeric-pane-key',
    source: value.source === AgentMigrationUnsupportedSource.SSH ? 'ssh' : 'local',
    updatedAt: Number(value.updatedAt),
    ...(value.worktreeId === undefined ? {} : { worktreeId: value.worktreeId }),
    ...(value.tabId === undefined ? {} : { tabId: value.tabId }),
    ...(value.leafId === undefined ? {} : { leafId: value.leafId }),
    ...(value.paneKey === undefined ? {} : { paneKey: value.paneKey })
  }
}

function subagent(value: AgentStatusSubagent): AgentStatusSubagentValue {
  return {
    id: value.id,
    state: subagentState(value.state),
    startedAt: Number(value.startedAt),
    ...(value.agentType === undefined ? {} : { agentType: value.agentType }),
    ...(value.model === undefined ? {} : { model: value.model }),
    ...(value.description === undefined ? {} : { description: value.description })
  }
}

// Why: the state enums are open at runtime — a future daemon can send a value
// this client does not know — so unknown values fall to the default arm.
function state(value: AgentStatusState): AgentStatusStateValue {
  switch (value) {
    case AgentStatusState.BLOCKED:
      return 'blocked'
    case AgentStatusState.WAITING:
      return 'waiting'
    case AgentStatusState.DONE:
      return 'done'
    default:
      return 'working'
  }
}

function subagentState(value: AgentSubagentState): AgentSubagentStateValue {
  switch (value) {
    case AgentSubagentState.BLOCKED:
      return 'blocked'
    case AgentSubagentState.WAITING:
      return 'waiting'
    case AgentSubagentState.IDLE:
      return 'idle'
    default:
      return 'working'
  }
}

function providerSessionKey(value: AgentProviderSessionKey): AgentProviderSessionKeyValue {
  return value === AgentProviderSessionKey.CONVERSATION_ID ? 'conversation_id' : 'session_id'
}

// Why: the wire distinguishes an explicitly local (null) connectionId from an
// absent one on restored entries, and both decode to the legacy null.
function connectionId(value: AgentStatusSnapshotEntry['connectionId']): string | null {
  const oneof = value?.value
  if (oneof?.case === 'text') {
    return oneof.value
  }
  return null
}

export function invalidAgentStatusResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}
