import type { ShellSessionDocumentValue, ShellSessionJsonValue } from '@agentstart/protocol'

type Entry = ShellSessionJsonValue | undefined
export type SessionMergeResult =
  | { ok: true; document: ShellSessionDocumentValue }
  | { ok: false; paths: string[] }

// Why: A renderer sends large keyed maps; comparing its base preserves other clients' entries.
export function mergeSessionEdit(
  base: ShellSessionDocumentValue,
  desired: ShellSessionDocumentValue,
  current: ShellSessionDocumentValue,
  force = false
): SessionMergeResult {
  const conflicts: string[] = []
  const value = merge(base, desired, current, [], conflicts, force)
  return conflicts.length || !isRecord(value)
    ? { ok: false, paths: conflicts }
    : { ok: true, document: value }
}

function isRecord(value: Entry): value is ShellSessionDocumentValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function equal(a: Entry, b: Entry, depth = 0): boolean {
  if (depth > 64) {
    return false
  }
  if (a === b) {
    return true
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => equal(value, b[index], depth + 1))
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a)
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key], depth + 1))
    )
  }
  return false
}

function merge(
  base: Entry,
  desired: Entry,
  current: Entry,
  path: string[],
  conflicts: string[],
  force: boolean
): Entry {
  if (equal(base, desired)) {
    return current
  }
  if (equal(base, current) || equal(desired, current)) {
    return desired
  }
  if (path.length > 64) {
    conflicts.push(path.join('.'))
    return current
  }
  if (path[0] === 'terminalLayoutsByTabId' && path.length === 2) {
    // Why: removing a terminal tab is a deliberate local topology change. A
    // daemon scrollback/binding update for the same stale tab must not block
    // that removal with an unrecoverable save toast.
    if (!isRecord(desired) || !isRecord(current)) {
      return desired
    }
  }
  const terminalLayoutField = getTerminalLayoutField(path)
  if (terminalLayoutField === 'root') {
    // Why: terminal topology is UI state shared with mobile and daemon-owned
    // terminal creation. Keep the latest topology that contains the most pane
    // identities instead of turning an otherwise recoverable layout update
    // into a blocking save conflict.
    return mergeTerminalLayoutRoot(desired, current)
  }
  if (
    terminalLayoutField === 'activeLeafId' ||
    terminalLayoutField === 'expandedLeafId' ||
    terminalLayoutField === 'titlesByLeafId'
  ) {
    // Why: these values describe the renderer's visible layout. The local
    // projection is the user's latest intent, so it wins when both clients
    // changed the same field.
    return desired
  }
  if (
    terminalLayoutField === 'ptyIdsByLeafId' ||
    terminalLayoutField === 'buffersByLeafId' ||
    terminalLayoutField === 'scrollbackRefsByLeafId'
  ) {
    // Why: PTY bindings and captured scrollback are daemon-owned facts. Keep
    // the current server value when both clients touched the same leaf.
    return mergeTerminalLeafMap(base, desired, current)
  }
  const recordBase = isRecord(base)
    ? base
    : base === undefined && isTerminalTabPath(path)
      ? {}
      : null
  if (recordBase && isRecord(desired) && isRecord(current)) {
    const entries: [string, ShellSessionJsonValue][] = []
    for (const key of new Set([
      ...Object.keys(recordBase),
      ...Object.keys(desired),
      ...Object.keys(current)
    ])) {
      const value = merge(
        Object.hasOwn(recordBase, key) ? recordBase[key] : undefined,
        Object.hasOwn(desired, key) ? desired[key] : undefined,
        Object.hasOwn(current, key) ? current[key] : undefined,
        [...path, key],
        conflicts,
        force
      )
      if (value !== undefined) {
        entries.push([key, value])
      }
    }
    return Object.fromEntries(entries)
  }
  if (
    (Array.isArray(base) || (base === undefined && isTerminalTabCollectionPath(path))) &&
    Array.isArray(desired) &&
    Array.isArray(current)
  ) {
    const oldItems = Array.isArray(base) ? keyed(base) : new Map()
    const nextItems = keyed(desired)
    const liveItems = keyed(current)
    if (oldItems && nextItems && liveItems) {
      return mergeItems(oldItems, nextItems, liveItems, path, conflicts, force)
    }
  }
  if (force) {
    return desired
  }
  conflicts.push(path.join('.'))
  return current
}

type TerminalLayoutField =
  | 'root'
  | 'activeLeafId'
  | 'expandedLeafId'
  | 'ptyIdsByLeafId'
  | 'buffersByLeafId'
  | 'scrollbackRefsByLeafId'
  | 'titlesByLeafId'

function getTerminalLayoutField(path: string[]): TerminalLayoutField | null {
  if (path[0] !== 'terminalLayoutsByTabId' || path.length !== 3) {
    return null
  }
  const field = path[2]
  switch (field) {
    case 'root':
    case 'activeLeafId':
    case 'expandedLeafId':
    case 'ptyIdsByLeafId':
    case 'buffersByLeafId':
    case 'scrollbackRefsByLeafId':
    case 'titlesByLeafId':
      return field
    default:
      return null
  }
}

function mergeTerminalLayoutRoot(desired: Entry, current: Entry): Entry {
  if (!isRecord(desired) || !isRecord(current)) {
    return desired
  }
  const desiredLeaves = collectTerminalLeafIds(desired)
  const currentLeaves = collectTerminalLeafIds(current)
  if (
    currentLeaves.size > desiredLeaves.size &&
    [...desiredLeaves].every((leafId) => currentLeaves.has(leafId))
  ) {
    return current
  }
  return desired
}

function collectTerminalLeafIds(value: Entry, result = new Set<string>()): Set<string> {
  if (!isRecord(value)) {
    return result
  }
  if (value.type === 'leaf' && typeof value.leafId === 'string') {
    result.add(value.leafId)
    return result
  }
  if (value.type === 'split') {
    collectTerminalLeafIds(value.first, result)
    collectTerminalLeafIds(value.second, result)
  }
  return result
}

function mergeTerminalLeafMap(base: Entry, desired: Entry, current: Entry): Entry {
  if (!isRecord(desired) || !isRecord(current)) {
    return current
  }
  const baseRecord = isRecord(base) ? base : {}
  const result: Record<string, ShellSessionJsonValue> = {}
  for (const key of new Set([
    ...Object.keys(baseRecord),
    ...Object.keys(desired),
    ...Object.keys(current)
  ])) {
    const baseValue = Object.hasOwn(baseRecord, key) ? baseRecord[key] : undefined
    const desiredValue = Object.hasOwn(desired, key) ? desired[key] : undefined
    const currentValue = Object.hasOwn(current, key) ? current[key] : undefined
    const value = equal(baseValue, desiredValue)
      ? currentValue
      : equal(baseValue, currentValue) || equal(desiredValue, currentValue)
        ? desiredValue
        : currentValue
    if (value !== undefined) {
      result[key] = value
    }
  }
  return result
}

function isTerminalTabCollectionPath(path: string[]): boolean {
  return path.length === 2 && path[0] === 'tabsByWorktree'
}

function isTerminalTabPath(path: string[]): boolean {
  return path.length === 3 && path[0] === 'tabsByWorktree'
}

function keyed(values: ShellSessionJsonValue[]): Map<string, ShellSessionDocumentValue> | null {
  const map = new Map<string, ShellSessionDocumentValue>()
  for (const value of values) {
    if (!isRecord(value) || typeof value.id !== 'string' || map.has(value.id)) {
      return null
    }
    map.set(value.id, value)
  }
  return map
}

function mergeItems(
  base: Map<string, ShellSessionDocumentValue>,
  desired: Map<string, ShellSessionDocumentValue>,
  current: Map<string, ShellSessionDocumentValue>,
  path: string[],
  conflicts: string[],
  force: boolean
): ShellSessionJsonValue[] {
  const common = [...base.keys()].filter((id) => desired.has(id) && current.has(id))
  const commonSet = new Set(common)
  const desiredOrder = [...desired.keys()].filter((id) => commonSet.has(id))
  const currentOrder = [...current.keys()].filter((id) => commonSet.has(id))
  const changedOrder = !equal(common, desiredOrder)
  if (
    changedOrder &&
    !equal(common, currentOrder) &&
    !equal(desiredOrder, currentOrder) &&
    !force
  ) {
    conflicts.push([...path, '$order'].join('.'))
  }
  const primary = changedOrder ? desired : current
  const secondary = changedOrder ? current : desired
  const order = [...primary.keys()]
  for (const [index, id] of [...secondary.keys()].entries()) {
    if (order.includes(id)) {
      continue
    }
    const predecessor = [...secondary.keys()]
      .slice(0, index)
      .toReversed()
      .find((key) => order.includes(key))
    order.splice(predecessor ? order.indexOf(predecessor) + 1 : 0, 0, id)
  }
  const result: ShellSessionJsonValue[] = []
  for (const id of order) {
    const value = merge(
      base.get(id),
      desired.get(id),
      current.get(id),
      [...path, id],
      conflicts,
      force
    )
    if (value !== undefined) {
      result.push(value)
    }
  }
  return result
}
