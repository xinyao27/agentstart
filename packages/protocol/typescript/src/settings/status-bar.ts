import type { StatusBarItem } from './ui-state'

export const DEFAULT_STATUS_BAR_ITEMS: StatusBarItem[] = [
  'claude',
  'codex',
  'cursor',
  'gemini',
  'antigravity',
  'opencode-go',
  'kimi',
  'minimax',
  'grok',
  'resource-usage',
  'ports'
]

const LEGACY_DEFAULT_STATUS_BAR_ITEMS: readonly StatusBarItem[] = [
  'claude',
  'codex',
  'gemini',
  'antigravity',
  'opencode-go',
  'kimi',
  'minimax',
  'grok',
  'resource-usage',
  'ports'
]

const PRE_CURSOR_DEFAULT_STATUS_BAR_ITEMS: readonly StatusBarItem[] = [
  'claude',
  'codex',
  'resource-usage',
  'ports'
]

// Why: persisted UI state predates the consolidated resource-usage item and
// the current provider roster, so hydration needs one shared normalization.
export function normalizeStatusBarItems(items: readonly string[] | undefined): StatusBarItem[] {
  const source = items ?? DEFAULT_STATUS_BAR_ITEMS
  const normalized: string[] = []
  for (const id of source) {
    // Why: 'ssh' was a shipped default before remote hosts were removed. It has
    // to be dropped here rather than just deleted from the arrays below — the
    // legacy-upgrade checks compare by exact length, so a persisted 'ssh' would
    // make an otherwise-default config miss every upgrade and keep a dead entry.
    if (id === 'ssh') {
      continue
    }
    const mapped = id === 'memory' || id === 'sessions' ? 'resource-usage' : id
    if (!normalized.includes(mapped)) {
      normalized.push(mapped)
    }
  }

  // Why: provider migrations historically appended in different orders. Match
  // the full former default as a set; partial lists remain user customizations.
  if (
    normalized.length === LEGACY_DEFAULT_STATUS_BAR_ITEMS.length &&
    normalized.every((item) => LEGACY_DEFAULT_STATUS_BAR_ITEMS.some((id) => id === item))
  ) {
    return [...DEFAULT_STATUS_BAR_ITEMS]
  }
  // Why: Cursor usage shipped after the compact provider defaults. Upgrade
  // that exact default set so existing users receive every configured, detected meter.
  if (
    normalized.length === PRE_CURSOR_DEFAULT_STATUS_BAR_ITEMS.length &&
    normalized.every((item) => PRE_CURSOR_DEFAULT_STATUS_BAR_ITEMS.some((id) => id === item))
  ) {
    return [...DEFAULT_STATUS_BAR_ITEMS]
  }
  // Why: preserve unrecognized saved IDs while applying only historical-default migrations.
  return normalized as StatusBarItem[]
}
