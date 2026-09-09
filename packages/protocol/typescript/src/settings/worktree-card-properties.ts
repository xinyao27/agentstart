import type { WorktreeCardProperty } from './ui-state.js'

const FIXED_WORKTREE_CARD_PROPERTIES: WorktreeCardProperty[] = ['status', 'unread']

export const DEFAULT_WORKTREE_CARD_PROPERTIES: WorktreeCardProperty[] = [
  ...FIXED_WORKTREE_CARD_PROPERTIES,
  'comment',
  'ports',
  // Why: retain the persisted key while the surface now means canonical open
  // tabs. Existing profiles keep their display preference across the migration.
  'inline-agents'
]

const WORKTREE_CARD_PROPERTY_ORDER: WorktreeCardProperty[] = [
  'status',
  'unread',
  'branch',
  'comment',
  'ports',
  'inline-agents'
]

export function normalizeWorktreeCardProperties(
  properties: readonly unknown[] | null | undefined
): WorktreeCardProperty[] {
  const normalized: WorktreeCardProperty[] = [...FIXED_WORKTREE_CARD_PROPERTIES]
  const source = properties ?? DEFAULT_WORKTREE_CARD_PROPERTIES
  for (const property of WORKTREE_CARD_PROPERTY_ORDER) {
    if (source.includes(property) && !normalized.includes(property)) {
      normalized.push(property)
    }
  }
  return normalized
}
