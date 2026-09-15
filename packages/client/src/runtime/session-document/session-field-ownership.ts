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

/** How a root session field reconciles a collision between two writers. */
type RootFieldRule = 'local' | 'live-sessions'

// Why: a leaf two writers changed differently is only a conflict when both of
// them own it. This document mixes the renderer's view state with facts the
// daemon mirrors on its own — it activates a surface whenever it binds a PTY and
// prunes the owners a removal deleted — so a daemon-side write of a field the
// renderer also tracks surfaced as "another client changed …" for an edit no
// second surface ever made. Name the owner per field; unlisted fields stay
// editable content, where a real collision still asks the user.
const ROOT_FIELD_RULES: Record<string, RootFieldRule> = {
  // The surface that just acted owns where it is looking: the daemon writes the
  // same selection when a terminal is created or activated from anywhere, so a
  // local switch collides with a remote activation inside one write window.
  activeRepoId: 'local',
  activeWorkspaceKey: 'local',
  activeWorktreeId: 'local',
  activeTabId: 'local',
  activeGroupIdByWorktree: 'local',
  activeTabIdByWorktree: 'local',
  activeFileIdByWorktree: 'local',
  activeTabTypeByWorktree: 'local',
  activeBrowserTabIdByWorktree: 'local',
  markdownFrontmatterVisible: 'local',
  // Why: two surfaces stamping the same worktree is a timestamp race, not a
  // collision of edits — the later visit is the answer, not a question.
  lastVisitedAtByWorktreeId: 'local',
  // Why: these name a set of live sessions, and every writer only sees its own
  // terminals. The union keeps the targets each writer observed and is a
  // fixpoint, so both surfaces converge instead of overwriting each other.
  activeWorktreeIdsOnShutdown: 'live-sessions',
  activeConnectionIdsAtShutdown: 'live-sessions'
}

export function rootFieldRule(path: readonly string[]): RootFieldRule | null {
  return ROOT_FIELD_RULES[path[0]] ?? null
}

export function resolveRootField(desired: Entry, current: Entry, rule: RootFieldRule): Entry {
  if (rule === 'live-sessions' && Array.isArray(desired) && Array.isArray(current)) {
    const merged = [...current]
    for (const value of desired) {
      if (!merged.includes(value)) {
        merged.push(value)
      }
    }
    return merged
  }
  return desired
}

function isEmptyEntry(value: Entry): boolean {
  return value === null || value === undefined || value === ''
}
