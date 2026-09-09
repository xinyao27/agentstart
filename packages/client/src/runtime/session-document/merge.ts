import type { ShellSessionDocumentValue, ShellSessionJsonValue } from '@yiru/protocol'

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
  if (isRecord(base) && isRecord(desired) && isRecord(current)) {
    const entries: [string, ShellSessionJsonValue][] = []
    for (const key of new Set([
      ...Object.keys(base),
      ...Object.keys(desired),
      ...Object.keys(current)
    ])) {
      const value = merge(
        Object.hasOwn(base, key) ? base[key] : undefined,
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
  if (Array.isArray(base) && Array.isArray(desired) && Array.isArray(current)) {
    const oldItems = keyed(base)
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
