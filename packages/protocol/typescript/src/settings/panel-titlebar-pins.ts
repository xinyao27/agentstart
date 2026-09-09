import type { WorkspaceTitlebarActionId } from './ui-state.js'

export type { WorkspaceTitlebarActionId } from './ui-state.js'

export const WORKSPACE_TITLEBAR_OPEN_IN_ACTION_ID = 'open-in' as const
export const WORKSPACE_TITLEBAR_COMMANDS_ACTION_ID = 'commands' as const

// Why: default pins keep Open in visible; Command stays in More until pinned.
export const DEFAULT_WORKSPACE_PANEL_TITLEBAR_PINNED_IDS: readonly WorkspaceTitlebarActionId[] = [
  'explorer',
  'source-control',
  'vault',
  WORKSPACE_TITLEBAR_OPEN_IN_ACTION_ID
]

export function isWorkspaceTitlebarActionId(value: string): value is WorkspaceTitlebarActionId {
  return (
    value === WORKSPACE_TITLEBAR_OPEN_IN_ACTION_ID ||
    value === WORKSPACE_TITLEBAR_COMMANDS_ACTION_ID ||
    ['explorer', 'vault', 'workspaces', 'pr-checks', 'source-control', 'ports'].includes(value)
  )
}

export function normalizeWorkspacePanelTitlebarPinnedIds(
  ids: readonly unknown[] | null | undefined
): WorkspaceTitlebarActionId[] {
  const source = ids ?? DEFAULT_WORKSPACE_PANEL_TITLEBAR_PINNED_IDS
  const normalized: WorkspaceTitlebarActionId[] = []
  for (const value of source) {
    if (typeof value !== 'string') {
      continue
    }
    // Why: Checks used to be a standalone titlebar panel. Preserve its pin
    // position while migrating it to the combined Changes & Review panel.
    const id = value === 'checks' ? 'source-control' : value
    if (!isWorkspaceTitlebarActionId(id)) {
      continue
    }
    if (normalized.includes(id)) {
      continue
    }
    normalized.push(id)
  }

  // Why: builds that only persisted panel ids omitted Open in; append it once so
  // upgrades keep the previous always-on Open in placement at the strip end.
  if (
    ids != null &&
    !normalized.includes(WORKSPACE_TITLEBAR_OPEN_IN_ACTION_ID) &&
    !ids.includes(WORKSPACE_TITLEBAR_OPEN_IN_ACTION_ID)
  ) {
    normalized.push(WORKSPACE_TITLEBAR_OPEN_IN_ACTION_ID)
  }

  return normalized
}
