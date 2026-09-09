import type { TerminalTab } from '@yiru/protocol/workspace/tabs'

function indexFirstById<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  const index = new Map<string, T>()
  for (const row of rows) {
    // Why: session hydration historically used a linear find, so duplicate
    // recovery records must continue resolving to the first observed owner.
    if (!index.has(row.id)) {
      index.set(row.id, row)
    }
  }
  return index
}

export function buildTerminalSessionTabIndex(
  tabs: readonly TerminalTab[]
): Map<string, TerminalTab> {
  return indexFirstById(tabs)
}
