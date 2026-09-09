import { normalizeExecutionHostId } from '../host/identity.js'
import type { ManualRepoOrderEntry } from '../settings/ui-state.js'

function getEntryKey(entry: ManualRepoOrderEntry): string {
  return `${entry.hostId}\0${entry.repoId}`
}

export function normalizeManualRepoOrder(value: unknown): ManualRepoOrderEntry[] {
  if (!Array.isArray(value)) {
    return []
  }
  const entries: ManualRepoOrderEntry[] = []
  const seen = new Set<string>()
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') {
      continue
    }
    const hostId =
      'hostId' in candidate && typeof candidate.hostId === 'string'
        ? normalizeExecutionHostId(candidate.hostId)
        : null
    const repoId =
      'repoId' in candidate && typeof candidate.repoId === 'string' ? candidate.repoId : ''
    if (!hostId || !repoId.trim()) {
      continue
    }
    const entry = { hostId, repoId }
    const key = getEntryKey(entry)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    entries.push(entry)
  }
  return entries
}
