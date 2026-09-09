import { parseWorkspaceKey } from '@yiru/protocol/workspace/identity'
import type { StateCreator } from 'zustand'

import type { AppState } from '../../store/types'
import { findWorktreeById } from './types'

// Why: cap the per-session history so a long-lived workspace with many
// worktree jumps cannot grow the array unbounded. 50 is generous enough
// that the cap is never visible in normal use but small enough that the
// linear skip-deleted scan in goBack/goForward stays trivially cheap.
const MAX_HISTORY = 50

export type WorktreeNavHistoryEntry = string

export type WorktreeNavHistorySlice = {
  // Linear history, oldest -> newest.
  worktreeNavHistory: WorktreeNavHistoryEntry[]
  // Index into worktreeNavHistory; points at the currently-active entry.
  // -1 means empty (no worktree ever activated this session).
  worktreeNavHistoryIndex: number
  // Why: set while goBack/goForward are calling activateAndRevealWorktree so
  // the activation path's recordWorktreeVisit step can skip re-recording a
  // history-driven navigation. Kept in-store (rather than as a module-level
  // mutable) so tests can drive the slice in isolation.
  isNavigatingHistory: boolean

  recordWorktreeVisit: (worktreeId: string) => void
  goBackWorktree: () => void
  goForwardWorktree: () => void
}

type ActivateFn = (worktreeId: string) => unknown

// Why: the slice must call activateAndRevealWorktree from goBack/goForward, but
// importing it directly would create a cycle (activation imports the store).
// Install the reference at module init via setWorktreeNavActivator and keep
// the slice itself unaware of the activation module.
let activator: ActivateFn | null = null

export function setWorktreeNavActivator(fn: ActivateFn | null): void {
  activator = fn
}

// Why: installed by App-level init so the slice can dispatch page entries
// to setActiveView(...) without importing the UI slice directly (the UI
// slice already transitively depends on this module via the store creator).
function getHistoryEntryKey(entry: WorktreeNavHistoryEntry): string {
  return `worktree:${entry}`
}

function isLiveEntry(entry: WorktreeNavHistoryEntry, state: AppState): boolean {
  const workspaceScope = parseWorkspaceKey(entry)
  if (workspaceScope?.type === 'folder') {
    return state.folderWorkspaces.some(
      (workspace) => workspace.id === workspaceScope.folderWorkspaceId
    )
  }
  return findWorktreeById(state.worktreesByRepo, entry) !== undefined
}

function appendHistoryEntry(
  s: { worktreeNavHistory: WorktreeNavHistoryEntry[]; worktreeNavHistoryIndex: number },
  entry: WorktreeNavHistoryEntry
): { worktreeNavHistory: WorktreeNavHistoryEntry[]; worktreeNavHistoryIndex: number } {
  // Why: re-visiting the same entry must not pollute history. The de-dup
  // applies only to the current entry so that A -> B -> A remains a valid
  // stack (user left B, returned to A). Same rule covers page re-opens:
  // Repeated workspace opens collapse to one entry.
  const current = s.worktreeNavHistory[s.worktreeNavHistoryIndex]
  if (current !== undefined && getHistoryEntryKey(current) === getHistoryEntryKey(entry)) {
    return s
  }

  // Truncate any forward entries, then append and advance the index.
  const truncated = s.worktreeNavHistory.slice(0, s.worktreeNavHistoryIndex + 1)
  truncated.push(entry)
  let nextIndex = s.worktreeNavHistoryIndex + 1

  // Why: cap eviction drops the oldest entries. The index must shift left
  // by the same count so it still points at the just-appended current entry.
  if (truncated.length > MAX_HISTORY) {
    const evict = truncated.length - MAX_HISTORY
    truncated.splice(0, evict)
    nextIndex = Math.max(0, nextIndex - evict)
  }

  return {
    worktreeNavHistory: truncated,
    worktreeNavHistoryIndex: nextIndex
  }
}

export function findPrevLiveWorktreeHistoryIndex(state: AppState): number | null {
  for (let i = state.worktreeNavHistoryIndex - 1; i >= 0; i--) {
    if (isLiveEntry(state.worktreeNavHistory[i], state)) {
      return i
    }
  }
  return null
}

export function findNextLiveWorktreeHistoryIndex(state: AppState): number | null {
  for (let i = state.worktreeNavHistoryIndex + 1; i < state.worktreeNavHistory.length; i++) {
    if (isLiveEntry(state.worktreeNavHistory[i], state)) {
      return i
    }
  }
  return null
}

export function canGoBackWorktreeHistory(state: AppState): boolean {
  return findPrevLiveWorktreeHistoryIndex(state) !== null
}

export function canGoForwardWorktreeHistory(state: AppState): boolean {
  return findNextLiveWorktreeHistoryIndex(state) !== null
}

export const createWorktreeNavHistorySlice: StateCreator<
  AppState,
  [],
  [],
  WorktreeNavHistorySlice
> = (set, get) => ({
  worktreeNavHistory: [],
  worktreeNavHistoryIndex: -1,
  isNavigatingHistory: false,

  recordWorktreeVisit: (worktreeId) => {
    set((s) => appendHistoryEntry(s, worktreeId))
  },

  goBackWorktree: () => {
    navigateToIndex(get, set, 'back')
  },

  goForwardWorktree: () => {
    navigateToIndex(get, set, 'forward')
  }
})

function navigateToIndex(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
  direction: 'back' | 'forward'
): void {
  const state = get()
  if (direction === 'back') {
    if (state.worktreeNavHistoryIndex <= 0) {
      return
    }
  } else {
    if (state.worktreeNavHistoryIndex >= state.worktreeNavHistory.length - 1) {
      return
    }
  }
  const targetIndex =
    direction === 'back'
      ? findPrevLiveWorktreeHistoryIndex(state)
      : findNextLiveWorktreeHistoryIndex(state)
  if (targetIndex === null) {
    return
  }
  const targetEntry = state.worktreeNavHistory[targetIndex]

  // Why: capture-and-restore (not force false) so re-entrant navigation
  // (e.g. a store subscriber synchronously triggers another goBack) does
  // not race on the boolean — the outer call's `finally` restores its own
  // prior value rather than clobbering state set by an inner call.
  const prevNavigating = get().isNavigatingHistory
  set({ isNavigatingHistory: true } as Partial<AppState>)
  try {
    if (!activator) {
      // Why: a silent no-op here would mean the back/forward chord simply
      // does nothing with no diagnostic. The activator is registered at
      // module init by worktree-activation.ts, so a missing activator means
      // either test setup forgot to install one or the production import
      // graph regressed.
      console.warn(
        `go${direction === 'back' ? 'Back' : 'Forward'}Worktree called before worktree activator was registered`
      )
      return
    }
    // Why: activateAndRevealWorktree returns `ActivateAndRevealResult | false`;
    // `false` is the only observable failure signal. Advance the index only on
    // success so the slice stays consistent with what the user actually sees.
    const result = activator(targetEntry)
    if (result !== false) {
      set({ worktreeNavHistoryIndex: targetIndex } as Partial<AppState>)
    }
  } finally {
    set({ isNavigatingHistory: prevNavigating } as Partial<AppState>)
  }
}
