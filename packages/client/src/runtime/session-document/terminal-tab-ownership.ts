import type { ShellSessionJsonValue } from '@agentstart/protocol'

type Entry = ShellSessionJsonValue | undefined
export type SessionFieldOwner = 'local' | 'remote'

// Why: a terminal tab record is written by two owners. The renderer owns what
// the tab displays and what the user asked it to launch; the daemon owns the PTY
// facts it binds. Naming the owner per field keeps a daemon binding — or a
// second renderer's live title frame — from blocking the save of an unrelated
// local edit with a manual conflict.
const TERMINAL_TAB_FIELD_OWNERS: Record<string, SessionFieldOwner> = {
  ptyId: 'remote',
  worktreeInstanceId: 'remote',
  createdAt: 'remote',
  pendingActivationSpawn: 'remote',
  title: 'local',
  defaultTitle: 'local',
  generatedTitle: 'local',
  quickCommandLabel: 'local',
  customTitle: 'local',
  color: 'local',
  isPinned: 'local',
  sortOrder: 'local',
  shellOverride: 'local',
  startupCwd: 'local',
  launchAgent: 'local'
}

export function terminalTabFieldOwner(path: readonly string[]): SessionFieldOwner | null {
  if (path[0] !== 'tabsByWorktree' || path.length < 4) {
    return null
  }
  return TERMINAL_TAB_FIELD_OWNERS[path[3]] ?? null
}

export function resolveTerminalTabField(
  desired: Entry,
  current: Entry,
  owner: SessionFieldOwner
): Entry {
  if (owner === 'local') {
    return desired
  }
  // Why: an empty server placeholder must not erase a value the local renderer
  // already owns, but a populated server fact must not be replaced by a stale
  // local binding either.
  return isEmptyEntry(current) && !isEmptyEntry(desired) ? desired : current
}

function isEmptyEntry(value: Entry): boolean {
  return value === null || value === undefined || value === ''
}
