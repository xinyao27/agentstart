import type { AgentPhase } from '@agentstart/protocol/agent/phase'

const PRESENCE_KEY = 'agentPresenceBySource.v1'
const PRESENCE_TTL_MS = 45_000

export type AgentNotificationTarget = {
  projectId: string
  terminal: string
  title: string
  worktreeId: string
}

export type AgentPresenceInput = {
  activeCount: number
  activeProjectIds: string[]
  activeTerminalHandles: string[]
  phase: AgentPhase | null
  waiting: AgentNotificationTarget[]
}

type AgentPresenceRecord = AgentPresenceInput & { updatedAt: number }

let mutationQueue = Promise.resolve()

export function acceptAgentPresence(
  source: string,
  input: AgentPresenceInput,
  apply: (presence: AgentPresenceInput) => Promise<void>
): void {
  enqueue(async () => {
    const records = await readRecords()
    records[source] = { ...input, updatedAt: Date.now() }
    const fresh = freshRecords(records)
    await chrome.storage.session.set({ [PRESENCE_KEY]: fresh })
    await apply(aggregatePresence(Object.values(fresh)))
  })
}

export function forgetAgentPresence(
  source: string,
  apply: (presence: AgentPresenceInput) => Promise<void>
): void {
  enqueue(async () => {
    const records = await readRecords()
    delete records[source]
    const fresh = freshRecords(records)
    await chrome.storage.session.set({ [PRESENCE_KEY]: fresh })
    await apply(aggregatePresence(Object.values(fresh)))
  })
}

export function parseAgentPresence(message: object): AgentPresenceInput | null {
  const activeCount = Reflect.get(message, 'activeCount')
  const activeProjectIds = parseStringList(Reflect.get(message, 'activeProjectIds'))
  const activeTerminalHandles = parseStringList(Reflect.get(message, 'activeTerminalHandles'))
  const phase = Reflect.get(message, 'phase')
  const waiting = parseTargets(Reflect.get(message, 'waiting'))
  if (
    typeof activeCount !== 'number' ||
    !Number.isInteger(activeCount) ||
    activeCount < 0 ||
    !activeProjectIds ||
    !activeTerminalHandles ||
    !isAgentPhase(phase) ||
    !waiting
  ) {
    return null
  }
  return { activeCount, activeProjectIds, activeTerminalHandles, phase, waiting }
}

export function presenceSource(sender: chrome.runtime.MessageSender): string | null {
  if (sender.tab?.id !== undefined) {
    return `tab:${sender.tab.id}`
  }
  return sender.documentId ? `document:${sender.documentId}` : null
}

function enqueue(task: () => Promise<void>): void {
  mutationQueue = mutationQueue.then(task, task)
}

async function readRecords(): Promise<Record<string, AgentPresenceRecord>> {
  const stored: unknown = await chrome.storage.session.get(PRESENCE_KEY)
  const value =
    typeof stored === 'object' && stored !== null ? Reflect.get(stored, PRESENCE_KEY) : null
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([source, candidate]) => {
      if (typeof candidate !== 'object' || candidate === null) {
        return []
      }
      const presence = parseAgentPresence(candidate)
      const updatedAt = Reflect.get(candidate, 'updatedAt')
      return presence && typeof updatedAt === 'number' ? [[source, { ...presence, updatedAt }]] : []
    })
  )
}

function freshRecords(
  records: Record<string, AgentPresenceRecord>
): Record<string, AgentPresenceRecord> {
  const cutoff = Date.now() - PRESENCE_TTL_MS
  return Object.fromEntries(
    Object.entries(records).filter(([, record]) => record.updatedAt >= cutoff)
  )
}

function aggregatePresence(records: AgentPresenceRecord[]): AgentPresenceInput {
  const activeProjectIds = new Set<string>()
  const activeTerminalHandles = new Set<string>()
  const waiting = new Map<string, AgentNotificationTarget>()
  let phase: AgentPhase | null = null
  for (const record of records) {
    record.activeProjectIds.forEach((projectId) => activeProjectIds.add(projectId))
    record.activeTerminalHandles.forEach((terminal) => activeTerminalHandles.add(terminal))
    record.waiting.forEach((target) => waiting.set(target.terminal, target))
    if (phasePriority(record.phase) > phasePriority(phase)) {
      phase = record.phase
    }
  }
  return {
    activeCount: Math.max(
      activeTerminalHandles.size,
      ...records.map((record) => record.activeCount)
    ),
    activeProjectIds: [...activeProjectIds],
    activeTerminalHandles: [...activeTerminalHandles],
    phase,
    waiting: [...waiting.values()]
  }
}

function phasePriority(phase: AgentPhase | null): number {
  switch (phase) {
    case 'waiting-decision':
      return 4
    case 'executing':
      return 3
    case 'thinking':
      return 2
    case 'complete':
      return 1
    case null:
      return 0
  }
}

function parseTargets(value: unknown): AgentNotificationTarget[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const targets: AgentNotificationTarget[] = []
  for (const target of value) {
    if (
      typeof target !== 'object' ||
      target === null ||
      typeof Reflect.get(target, 'projectId') !== 'string' ||
      typeof Reflect.get(target, 'terminal') !== 'string' ||
      typeof Reflect.get(target, 'title') !== 'string' ||
      typeof Reflect.get(target, 'worktreeId') !== 'string'
    ) {
      return null
    }
    targets.push({
      projectId: Reflect.get(target, 'projectId'),
      terminal: Reflect.get(target, 'terminal'),
      title: Reflect.get(target, 'title'),
      worktreeId: Reflect.get(target, 'worktreeId')
    })
  }
  return targets
}

export function parseStringList(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : null
}

function isAgentPhase(value: unknown): value is AgentPhase | null {
  return (
    value === null ||
    value === 'thinking' ||
    value === 'executing' ||
    value === 'waiting-decision' ||
    value === 'complete'
  )
}
