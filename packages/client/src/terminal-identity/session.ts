import type { TerminalSummary } from '@agentstart/protocol'
import {
  classifyTerminalId,
  encodeRuntimePtyId,
  persistenceTerminalId,
  type RuntimePtyId,
  type TerminalIdIndex
} from '@agentstart/protocol/terminal-identity'
import type {
  TerminalLayoutSnapshot,
  WorkspaceSessionState
} from '@agentstart/protocol/workspace/session'

type LiveTerminalIdentity = Pick<
  TerminalSummary,
  'connected' | 'handle' | 'leafId' | 'ptyId' | 'tabId'
>

export type SessionTerminalIdFields = Pick<
  WorkspaceSessionState,
  'tabsByWorktree' | 'terminalLayoutsByTabId'
>

export type CanonicalSessionTerminalIds = {
  exchangedIdCount: number
  retiredIdCount: number
  session: WorkspaceSessionState
}

type TerminalBinding = {
  leafId?: string
  tabId: string
}

type TerminalIdentityIndexes = {
  byHandle: ReadonlyMap<string, readonly LiveTerminalIdentity[]>
  byPtyId: ReadonlyMap<string, readonly LiveTerminalIdentity[]>
}

export function hasCanonicalizableSessionTerminalIds(session: WorkspaceSessionState): boolean {
  for (const tabs of Object.values(session.tabsByWorktree)) {
    if (tabs.some((tab) => isCanonicalizableTerminalId(tab.ptyId))) {
      return true
    }
  }
  return Object.values(session.terminalLayoutsByTabId).some((layout) =>
    Object.values(layout.ptyIdsByLeafId ?? {}).some(isCanonicalizableTerminalId)
  )
}

function isCanonicalizableTerminalId(id: string | null | undefined): id is string {
  return typeof id === 'string' && classifyTerminalId(id).kind !== 'ssh'
}

function selectRuntimePtyId(
  terminals: readonly LiveTerminalIdentity[],
  environmentId: string | null
): RuntimePtyId | null {
  const ids = new Set(
    terminals.map((terminal) => encodeRuntimePtyId(terminal.handle, environmentId))
  )
  return ids.size === 1 ? ([...ids][0] ?? null) : null
}

function selectBoundRuntimePtyId(
  candidates: readonly LiveTerminalIdentity[],
  binding: TerminalBinding,
  environmentId: string | null
): RuntimePtyId | null {
  if (binding.leafId) {
    const exactLeaf = candidates.filter(
      (terminal) => terminal.tabId === binding.tabId && terminal.leafId === binding.leafId
    )
    const exactLeafId = selectRuntimePtyId(exactLeaf, environmentId)
    if (exactLeafId) {
      return exactLeafId
    }
  }
  const exactTabId = selectRuntimePtyId(
    candidates.filter((terminal) => terminal.tabId === binding.tabId),
    environmentId
  )
  return exactTabId ?? selectRuntimePtyId(candidates, environmentId)
}

function resolvePersistedTerminalId(
  ptyId: string,
  binding: TerminalBinding,
  indexes: TerminalIdentityIndexes,
  environmentId: string | null
): string | null {
  const classified = classifyTerminalId(ptyId)
  if (classified.kind === 'ssh') {
    return classified.id
  }
  if (classified.kind === 'runtime') {
    if (classified.environmentId !== environmentId) {
      return null
    }
    return selectBoundRuntimePtyId(
      indexes.byHandle.get(classified.handle) ?? [],
      binding,
      environmentId
    )
  }
  return selectBoundRuntimePtyId(indexes.byPtyId.get(ptyId) ?? [], binding, environmentId)
}

function replaceLayoutTerminalIds(
  layout: TerminalLayoutSnapshot,
  tabId: string,
  replace: (ptyId: string, binding: TerminalBinding) => string | null
): TerminalLayoutSnapshot {
  if (!layout.ptyIdsByLeafId) {
    return layout
  }
  const ptyIdsByLeafId: Record<string, string> = {}
  for (const [leafId, ptyId] of Object.entries(layout.ptyIdsByLeafId)) {
    const nextPtyId = replace(ptyId, { tabId, leafId })
    if (nextPtyId) {
      ptyIdsByLeafId[leafId] = nextPtyId
    }
  }
  const next = { ...layout }
  if (Object.keys(ptyIdsByLeafId).length > 0) {
    next.ptyIdsByLeafId = ptyIdsByLeafId
  } else {
    delete next.ptyIdsByLeafId
  }
  return next
}

function replaceSessionTerminalIds(
  fields: SessionTerminalIdFields,
  replace: (ptyId: string, binding: TerminalBinding) => string | null
): SessionTerminalIdFields {
  const tabsByWorktree = Object.fromEntries(
    Object.entries(fields.tabsByWorktree).map(([worktreeId, tabs]) => [
      worktreeId,
      tabs.map((tab) => ({
        ...tab,
        ptyId: tab.ptyId ? replace(tab.ptyId, { tabId: tab.id }) : null
      }))
    ])
  )
  const terminalLayoutsByTabId = Object.fromEntries(
    Object.entries(fields.terminalLayoutsByTabId).map(([tabId, layout]) => [
      tabId,
      replaceLayoutTerminalIds(layout, tabId, replace)
    ])
  )
  return { tabsByWorktree, terminalLayoutsByTabId }
}

function indexTerminalIdentities(
  terminals: readonly LiveTerminalIdentity[]
): TerminalIdentityIndexes {
  const byHandle = new Map<string, LiveTerminalIdentity[]>()
  const byPtyId = new Map<string, LiveTerminalIdentity[]>()
  for (const terminal of terminals) {
    if (!terminal.connected || !terminal.ptyId) {
      continue
    }
    const handleEntries = byHandle.get(terminal.handle) ?? []
    handleEntries.push(terminal)
    byHandle.set(terminal.handle, handleEntries)
    const ptyEntries = byPtyId.get(terminal.ptyId) ?? []
    ptyEntries.push(terminal)
    byPtyId.set(terminal.ptyId, ptyEntries)
  }
  return { byHandle, byPtyId }
}

export function canonicalizeSessionTerminalIds(
  session: WorkspaceSessionState,
  live: readonly LiveTerminalIdentity[],
  environmentId: string | null = null
): CanonicalSessionTerminalIds {
  if (!hasCanonicalizableSessionTerminalIds(session)) {
    return { session, exchangedIdCount: 0, retiredIdCount: 0 }
  }

  const indexes = indexTerminalIdentities(live)
  let exchangedIdCount = 0
  let retiredIdCount = 0
  const fields = replaceSessionTerminalIds(session, (ptyId, binding) => {
    const canonicalId = resolvePersistedTerminalId(ptyId, binding, indexes, environmentId)
    if (canonicalId) {
      if (canonicalId !== ptyId || classifyTerminalId(ptyId).kind === 'runtime') {
        exchangedIdCount += 1
      }
      return canonicalId
    }
    retiredIdCount += 1
    return null
  })

  return {
    session: { ...session, ...fields },
    exchangedIdCount,
    retiredIdCount
  }
}

export function persistenceSessionTerminalIds(
  fields: SessionTerminalIdFields,
  index: TerminalIdIndex
): SessionTerminalIdFields {
  return replaceSessionTerminalIds(fields, (id) => persistenceTerminalId(id, index))
}
