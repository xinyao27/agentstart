import type { Repo } from '@agentstart/protocol/project/repository'
import type { Worktree } from '@agentstart/protocol/worktree/model'
import { basename } from '~renderer/path'

import { IDLE, type WorktreeAttention } from './smart-attention'

export type SortBy = 'name' | 'smart' | 'recent' | 'repo' | 'manual'

// Why: a newly-created worktree's lastActivityAt is stamped at the moment
// createLocalWorktree finishes git + setup-runner prep (often several seconds
// after the user clicked Create). During and after that window, ambient PTY
// bumps on OTHER worktrees (data flush, exit, reconnect) can push the new
// worktree below them in Recent sort. This grace period gives the new
// worktree a floor of `createdAt + CREATE_GRACE_MS` in the Recent comparator
// so it stays on top until the user has had a chance to notice it. 5 min is
// long enough for the user to interact, short enough that steady-state
// ordering resumes quickly.
const CREATE_GRACE_MS = 5 * 60 * 1000

/**
 * Rank a worktree in Recent sort using `lastActivityAt`, but with a floor of
 * `createdAt + CREATE_GRACE_MS` *only during* the grace window (i.e. while
 * `now < createdAt + CREATE_GRACE_MS`). Once the window has elapsed, returns
 * `lastActivityAt` unchanged. Returns `lastActivityAt` unchanged for worktrees
 * without `createdAt` (discovered on disk, or persisted before this field
 * existed).
 */
function effectiveRecentActivity(worktree: Worktree, now: number): number {
  const { lastActivityAt, createdAt } = worktree
  // Why bound by now: a worktree with createdAt set but no subsequent activity
  // should not retain artificially-high recency forever; the floor exists to
  // absorb the noisy creation window only. Without this bound, a worktree
  // created days ago and never touched would keep ranking as if its activity
  // were `createdAt + 5min`, masking truly fresher worktrees indefinitely.
  if (createdAt === undefined || now >= createdAt + CREATE_GRACE_MS) {
    return lastActivityAt
  }
  return Math.max(lastActivityAt, createdAt + CREATE_GRACE_MS)
}

type WorktreeSortLabelInput = Pick<Worktree, 'displayName' | 'path' | 'id'>

function getWorktreeSortLabel(worktree: WorktreeSortLabelInput): string {
  const displayName = typeof worktree.displayName === 'string' ? worktree.displayName.trim() : ''
  if (displayName) {
    return displayName
  }

  // Why: persisted or remote worktree state can briefly omit displayName after
  // a custom workspace name is removed; sorting must stay render-safe.
  const pathLabel = typeof worktree.path === 'string' ? basename(worktree.path).trim() : ''
  return pathLabel || worktree.id
}

export function compareWorktreeSortLabel(
  a: WorktreeSortLabelInput,
  b: WorktreeSortLabelInput
): number {
  return getWorktreeSortLabel(a).localeCompare(getWorktreeSortLabel(b))
}

/**
 * Build a comparator for sorting worktrees based on the current sort mode.
 *
 * Smart mode requires `attentionByWorktree` — a per-worktree class +
 * timestamp map built once before sorting (see `buildAttentionByWorktree`).
 * Why non-optional: a forgotten caller would silently regress every worktree
 * to Class 4 (idle) and degrade the comparator to recent-activity ordering;
 * making the param required surfaces the omission as a typecheck error.
 */
export function buildWorktreeComparator(
  sortBy: SortBy,
  repoMap: Map<string, Repo>,
  now: number,
  attentionByWorktree: Map<string, WorktreeAttention>
): (a: Worktree, b: Worktree) => number {
  return (a, b) => {
    switch (sortBy) {
      case 'name':
        return compareWorktreeSortLabel(a, b)
      case 'smart': {
        const aw = attentionByWorktree.get(a.id) ?? IDLE
        const bw = attentionByWorktree.get(b.id) ?? IDLE
        return (
          // Why: 1 < 2 < 3 < 4 — lower class outranks higher.
          aw.cls - bw.cls ||
          // Why: within a class, the more recent attention event ranks first.
          bw.attentionTimestamp - aw.attentionTimestamp ||
          // Why: idle worktrees fall through to recency (and the create-grace
          // floor for brand-new worktrees) before alphabetical.
          effectiveRecentActivity(b, now) - effectiveRecentActivity(a, now) ||
          compareWorktreeSortLabel(a, b)
        )
      }
      case 'recent':
        // Why effectiveRecentActivity (not raw lastActivityAt): newly-created
        // worktrees get a CREATE_GRACE_MS floor on top of lastActivityAt so
        // ambient PTY bumps in other worktrees don't immediately push them
        // down. See CREATE_GRACE_MS above.
        //
        // Why not sortOrder: sortOrder is a snapshot of the smart-sort
        // ranking that only gets repersisted while the user is in "Smart"
        // mode, so it's frozen in Recent mode and ignores new terminal
        // events, meta edits, etc. lastActivityAt is the real "recency"
        // signal — bumped by bumpWorktreeActivity (PTY spawn, background
        // events) and by meaningful meta edits (comment, isUnread).
        return (
          effectiveRecentActivity(b, now) - effectiveRecentActivity(a, now) ||
          compareWorktreeSortLabel(a, b)
        )
      case 'repo': {
        const ra = repoMap.get(a.repoId)?.displayName ?? ''
        const rb = repoMap.get(b.repoId)?.displayName ?? ''
        const cmp = ra.localeCompare(rb)
        return cmp !== 0 ? cmp : compareWorktreeSortLabel(a, b)
      }
      case 'manual':
        // Why fallback to sortOrder: existing users have a persisted smart-sort
        // snapshot but no manualOrder yet, so Manual starts from a familiar
        // restored order instead of alphabetizing every legacy workspace.
        return (
          (b.manualOrder ?? b.sortOrder) - (a.manualOrder ?? a.sortOrder) ||
          compareWorktreeSortLabel(a, b)
        )
    }
  }
}
