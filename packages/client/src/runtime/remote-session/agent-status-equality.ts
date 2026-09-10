import {
  AGENT_STATUS_STALE_AFTER_MS,
  type AgentStatusEntry
} from '@agentstart/protocol/agent/status-records'
import type {
  TerminalLayoutSnapshot,
  TerminalPaneLayoutNode
} from '@agentstart/protocol/workspace/session'

export function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  return a.every((value, index) => value === b[index])
}

function sameAgentStateHistory(
  a: AgentStatusEntry['stateHistory'],
  b: AgentStatusEntry['stateHistory']
): boolean {
  if (a.length !== b.length) {
    return false
  }
  return a.every(
    (entry, index) =>
      entry.state === b[index]?.state &&
      entry.prompt === b[index]?.prompt &&
      entry.startedAt === b[index]?.startedAt &&
      entry.interrupted === b[index]?.interrupted
  )
}

export function agentStatusEntryEqual(
  a: AgentStatusEntry | undefined,
  b: AgentStatusEntry
): boolean {
  if (!a) {
    return false
  }
  return (
    a.state === b.state &&
    a.prompt === b.prompt &&
    a.updatedAt === b.updatedAt &&
    a.stateStartedAt === b.stateStartedAt &&
    a.agentType === b.agentType &&
    a.paneKey === b.paneKey &&
    a.worktreeId === b.worktreeId &&
    a.tabId === b.tabId &&
    a.terminalTitle === b.terminalTitle &&
    a.toolName === b.toolName &&
    a.toolInput === b.toolInput &&
    a.interactivePrompt === b.interactivePrompt &&
    a.lastAssistantMessage === b.lastAssistantMessage &&
    a.interrupted === b.interrupted &&
    a.promptInteractionKey === b.promptInteractionKey &&
    sameAgentStateHistory(a.stateHistory, b.stateHistory)
  )
}

export function isAgentStatusFresh(
  entry: Pick<AgentStatusEntry, 'updatedAt'>,
  now: number
): boolean {
  return now - entry.updatedAt <= AGENT_STATUS_STALE_AFTER_MS
}

export function isMirroredCommandCodeTurnBump(
  existing: AgentStatusEntry | undefined,
  entry: AgentStatusEntry
): boolean {
  return (
    existing?.agentType === 'command-code' &&
    entry.agentType === 'command-code' &&
    existing.state === 'working' &&
    entry.state === 'working' &&
    entry.stateStartedAt > existing.stateStartedAt
  )
}

function sameStringRecord(
  a: Readonly<Record<string, string>> | undefined,
  b: Readonly<Record<string, string>> | undefined
): boolean {
  const left = a ?? {}
  const right = b ?? {}
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) => Object.prototype.hasOwnProperty.call(right, key) && left[key] === right[key]
    )
  )
}

function terminalLayoutNodeEqual(
  a: TerminalPaneLayoutNode | null | undefined,
  b: TerminalPaneLayoutNode | null | undefined
): boolean {
  if (!a || !b) {
    return !a && !b
  }
  if (a.type !== b.type) {
    return false
  }
  if (a.type === 'leaf') {
    return b.type === 'leaf' && a.leafId === b.leafId
  }
  return (
    b.type === 'split' &&
    a.direction === b.direction &&
    a.ratio === b.ratio &&
    terminalLayoutNodeEqual(a.first, b.first) &&
    terminalLayoutNodeEqual(a.second, b.second)
  )
}

export function terminalLayoutEqual(
  a: TerminalLayoutSnapshot | undefined,
  b: TerminalLayoutSnapshot
): boolean {
  return (
    terminalLayoutNodeEqual(a?.root, b.root) &&
    (a?.activeLeafId ?? null) === b.activeLeafId &&
    (a?.expandedLeafId ?? null) === b.expandedLeafId &&
    sameStringRecord(a?.ptyIdsByLeafId, b.ptyIdsByLeafId) &&
    sameStringRecord(a?.buffersByLeafId, b.buffersByLeafId) &&
    sameStringRecord(a?.scrollbackRefsByLeafId, b.scrollbackRefsByLeafId) &&
    sameStringRecord(a?.titlesByLeafId, b.titlesByLeafId)
  )
}
