import type { DiffSource } from '~renderer/editor/state'

const EMPTY_OPEN_ROW_KEYS: ReadonlySet<string> = new Set()

const SIGNATURE_SEPARATOR = '::'

/**
 * Build the stable string that identifies the active editor file for highlight
 * matching: `${diffSource}::${relativePath}`. Kept as a primitive so the zustand
 * selector that produces it stays referentially stable across unrelated store
 * updates.
 */
export function buildActiveOpenFileSignature(
  diffSource: DiffSource | undefined,
  relativePath: string
): string {
  return `${diffSource ?? 'edit'}${SIGNATURE_SEPARATOR}${relativePath}`
}

const COMBINED_DIFF_SIGNATURE_SOURCES: ReadonlySet<string> = new Set([
  'combined-all',
  'combined-uncommitted',
  'combined-branch',
  'combined-commit'
])

/**
 * Expand an active-open-file signature into the `${area}::${path}` row keys used
 * by the Source Control tree/list. Staged/unstaged diffs match their side; plain
 * edit tabs prefer working-tree rows and fall back to staged-only rows. A
 * combined diff shows many files at once, so it highlights the row whose section
 * was last revealed inside it instead of its own tab path.
 */
export function buildActiveOpenRowKeys(
  signature: string | null,
  availableRowKeys?: ReadonlySet<string>,
  revealedRowKey?: string | null
): ReadonlySet<string> {
  if (!signature) {
    return EMPTY_OPEN_ROW_KEYS
  }

  const separatorIndex = signature.indexOf(SIGNATURE_SEPARATOR)
  if (separatorIndex === -1) {
    return EMPTY_OPEN_ROW_KEYS
  }

  const diffSource = signature.slice(0, separatorIndex)
  const path = signature.slice(separatorIndex + SIGNATURE_SEPARATOR.length)
  if (path.length === 0) {
    return EMPTY_OPEN_ROW_KEYS
  }

  if (COMBINED_DIFF_SIGNATURE_SOURCES.has(diffSource)) {
    return revealedRowKey
      ? filterAvailableRowKeys([revealedRowKey], availableRowKeys)
      : EMPTY_OPEN_ROW_KEYS
  }

  if (diffSource === 'staged') {
    return filterAvailableRowKeys([`staged::${path}`], availableRowKeys)
  }

  const workingTreeKeys = [`unstaged::${path}`, `untracked::${path}`]
  if (diffSource === 'unstaged') {
    return filterAvailableRowKeys(workingTreeKeys, availableRowKeys)
  }

  if (diffSource === 'edit') {
    const availableWorkingTreeKeys = filterAvailableRowKeys(workingTreeKeys, availableRowKeys)
    if (availableWorkingTreeKeys.size > 0 || !availableRowKeys) {
      return availableWorkingTreeKeys
    }
    return filterAvailableRowKeys([`staged::${path}`], availableRowKeys)
  }

  return EMPTY_OPEN_ROW_KEYS
}

function filterAvailableRowKeys(
  candidates: string[],
  availableRowKeys: ReadonlySet<string> | undefined
): ReadonlySet<string> {
  if (!availableRowKeys) {
    return new Set(candidates)
  }
  const keys = candidates.filter((key) => availableRowKeys.has(key))
  return keys.length > 0 ? new Set(keys) : EMPTY_OPEN_ROW_KEYS
}
