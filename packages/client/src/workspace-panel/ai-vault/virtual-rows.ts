import type { AiVaultSession } from '~renderer/workspace-panel/ai-vault/session/record'

import type { AiVaultSessionGroup } from './session/filter'

// Why: groups and their sessions are one flat list so LegendList owns a single
// scroller and can pin the group rows through stickyHeaderIndices.
export type AiVaultListRow =
  | { type: 'group'; key: string; group: AiVaultSessionGroup }
  | { type: 'session'; key: string; groupKey: string; session: AiVaultSession }

export type AiVaultListModel = {
  rows: AiVaultListRow[]
  stickyHeaderIndices: number[]
}

export function buildAiVaultListModel({
  groups,
  collapsedGroups
}: {
  groups: readonly AiVaultSessionGroup[]
  collapsedGroups: ReadonlySet<string>
}): AiVaultListModel {
  const rows: AiVaultListRow[] = []
  const stickyHeaderIndices: number[] = []
  for (const group of groups) {
    stickyHeaderIndices.push(rows.length)
    rows.push({ type: 'group', key: `group:${group.key}`, group })
    if (collapsedGroups.has(group.key)) {
      continue
    }
    for (const session of group.sessions) {
      rows.push({
        type: 'session',
        key: `session:${session.id}`,
        groupKey: group.key,
        session
      })
    }
  }
  return { rows, stickyHeaderIndices }
}

export function getAiVaultListRowKey(row: AiVaultListRow): string {
  return row.key
}

export function getAiVaultListRowType(row: AiVaultListRow): string {
  return row.type
}
