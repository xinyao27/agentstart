import type { DiffComment } from '@yiru/protocol/git/diff-review'
import type { StateCreator } from 'zustand'
import { createBrowserUuid } from '~renderer/browser/uuid'
import { readProjectCatalogWorktree } from '~renderer/project-catalog/worktree-cache'
import type { AppState } from '~renderer/store/types'

import {
  diffCommentDeliverySnapshotMatches,
  normalizeDiffComment,
  type DiffCommentDeliverySnapshot
} from './comment-model'
import { enqueueDiffCommentPersistence } from './comment-persistence'
import { mutateDiffComments, rollbackDiffComments } from './optimistic-comments'

export type { DiffCommentDeliverySnapshot } from './comment-model'

export type DiffCommentsSlice = {
  getDiffComments: (worktreeId: string | null | undefined) => readonly DiffComment[]
  addDiffComment: (input: Omit<DiffComment, 'id' | 'createdAt'>) => Promise<DiffComment | null>
  updateDiffComment: (worktreeId: string, commentId: string, body: string) => Promise<boolean>
  clearDeliveredDiffComments: (
    worktreeId: string,
    comments: readonly DiffCommentDeliverySnapshot[]
  ) => Promise<boolean>
  markDiffCommentsSent: (
    worktreeId: string,
    commentIds: readonly string[],
    sentAt?: number
  ) => Promise<boolean>
  deleteDiffComment: (worktreeId: string, commentId: string) => Promise<void>
  clearDiffComments: (worktreeId: string) => Promise<boolean>
  clearDiffCommentsForFile: (worktreeId: string, filePath: string) => Promise<boolean>
}

function generateId(): string {
  return createBrowserUuid()
}

// Why: return a stable reference when no comments exist so selectors don't
// produce a fresh `[]` on every store update. A new array identity would
// trigger re-renders in any consumer using referential equality.
// Frozen + typed `readonly` so an accidental `list.push(...)` on the returned
// value is both a runtime TypeError and a TypeScript compile error, preventing
// the sentinel from being corrupted globally.
const EMPTY_COMMENTS: readonly DiffComment[] = Object.freeze([])

export const createDiffCommentsSlice: StateCreator<AppState, [], [], DiffCommentsSlice> = (
  _set,
  get
) => ({
  getDiffComments: (worktreeId) => {
    // Why: accept null/undefined so callers with an optional active worktree
    // can pass it through without allocating a fresh `[]` fallback each
    // render, which would defeat the `EMPTY_COMMENTS` sentinel's referential
    // stability and trigger spurious re-renders in useAppStore selectors.
    if (!worktreeId) {
      return EMPTY_COMMENTS
    }
    const worktree = readProjectCatalogWorktree(worktreeId)
    if (!worktree?.diffComments) {
      return EMPTY_COMMENTS
    }
    return worktree.diffComments
  },

  addDiffComment: async (input) => {
    const comment: DiffComment = normalizeDiffComment({
      ...input,
      id: generateId(),
      createdAt: Date.now()
    })
    const result = mutateDiffComments(input.worktreeId, (existing) => [...existing, comment])
    if (!result) {
      return null
    }
    try {
      // Why: enqueue through the per-worktree queue so concurrent mutations
      // cannot land on disk out of call order. The queued write reads the
      // latest Query snapshot at dequeue time, so it will reflect any newer
      // mutation that landed after this one was enqueued.
      await enqueueDiffCommentPersistence(input.worktreeId)
      get().recordFeatureInteraction?.('review-notes')
      return comment
    } catch (err) {
      console.error('Failed to persist diff comments:', err)
      // Why: rollback's identity guard will no-op if a later mutation has
      // already replaced the in-memory list, so losing a successful newer
      // write is not possible here even though we queued in order.
      rollbackDiffComments(input.worktreeId, result.previous, result.next)
      return null
    }
  },

  updateDiffComment: async (worktreeId, commentId, body) => {
    // Why: trim trailing whitespace but reject an entirely-empty edit so we
    // don't end up with a saved note that renders as a blank card. Callers
    // should treat `false` as "edit not committed" and keep the editor open
    // so the user can either type more or cancel explicitly.
    const trimmed = body.trim()
    if (!trimmed) {
      return false
    }

    // Why: look up the current state outside the mutation updater so we can
    // distinguish "comment missing" (return false — likely an edit-while-
    // deleted race; the card should keep its draft and not silently close)
    // from "body unchanged" (return true — benign no-op; the card can close
    // the editor without surfacing an error).
    const target = readProjectCatalogWorktree(worktreeId)
    const existing = target?.diffComments ?? []
    const existingIdx = existing.findIndex((c) => c.id === commentId)
    if (existingIdx === -1) {
      return false
    }
    if (existing[existingIdx].body === trimmed) {
      return true
    }

    const result = mutateDiffComments(worktreeId, (current) => {
      const idx = current.findIndex((c) => c.id === commentId)
      if (idx === -1) {
        return null
      }
      if (current[idx].body === trimmed) {
        return null
      }
      const next = current.slice()
      // Why: editing a previously-sent note makes the agent's copy stale, so
      // the note should become eligible for the next Send notes action.
      next[idx] = { ...current[idx], body: trimmed, sentAt: undefined }
      return next
    })
    if (!result) {
      // Why: between the pre-check and the set updater, the comment vanished
      // or another mutation already wrote the same body. Treat as success so
      // the caller closes its editor.
      return true
    }
    try {
      await enqueueDiffCommentPersistence(worktreeId)
      return true
    } catch (err) {
      console.error('Failed to persist diff comments:', err)
      rollbackDiffComments(worktreeId, result.previous, result.next)
      return false
    }
  },

  clearDeliveredDiffComments: async (worktreeId, comments) => {
    if (comments.length === 0) {
      return true
    }
    const snapshotsById = new Map(comments.map((comment) => [comment.id, comment]))
    const result = mutateDiffComments(worktreeId, (existing) => {
      const next = existing.filter((comment) => {
        const snapshot = snapshotsById.get(comment.id)
        // Why: delivery is async. If the user edits a note before the prompt
        // is accepted by the agent, the old snapshot was sent but the current
        // note is a fresh pending note and must stay visible.
        return !snapshot || !diffCommentDeliverySnapshotMatches(comment, snapshot)
      })
      return next.length === existing.length ? null : next
    })
    if (!result) {
      return true
    }
    try {
      await enqueueDiffCommentPersistence(worktreeId)
      get().recordFeatureInteraction?.('review-notes')
      return true
    } catch (err) {
      console.error('Failed to persist diff comments:', err)
      rollbackDiffComments(worktreeId, result.previous, result.next)
      return false
    }
  },

  markDiffCommentsSent: async (worktreeId, commentIds, sentAt = Date.now()) => {
    if (commentIds.length === 0) {
      return true
    }
    const ids = new Set(commentIds)
    const result = mutateDiffComments(worktreeId, (existing) => {
      let changed = false
      const next = existing.map((comment) => {
        if (!ids.has(comment.id) || comment.sentAt === sentAt) {
          return comment
        }
        changed = true
        return { ...comment, sentAt }
      })
      return changed ? next : null
    })
    if (!result) {
      return true
    }
    try {
      await enqueueDiffCommentPersistence(worktreeId)
      get().recordFeatureInteraction?.('review-notes')
      return true
    } catch (err) {
      console.error('Failed to persist diff comments:', err)
      rollbackDiffComments(worktreeId, result.previous, result.next)
      return false
    }
  },

  deleteDiffComment: async (worktreeId, commentId) => {
    const result = mutateDiffComments(worktreeId, (existing) => {
      const next = existing.filter((c) => c.id !== commentId)
      return next.length === existing.length ? null : next
    })
    if (!result) {
      return
    }
    try {
      // Why: enqueue through the per-worktree queue so concurrent mutations
      // cannot land on disk out of call order.
      await enqueueDiffCommentPersistence(worktreeId)
    } catch (err) {
      console.error('Failed to persist diff comments:', err)
      rollbackDiffComments(worktreeId, result.previous, result.next)
    }
  },

  clearDiffComments: async (worktreeId) => {
    const result = mutateDiffComments(worktreeId, (existing) => (existing.length === 0 ? null : []))
    if (!result) {
      return true
    }
    try {
      await enqueueDiffCommentPersistence(worktreeId)
      return true
    } catch (err) {
      console.error('Failed to persist diff comments:', err)
      rollbackDiffComments(worktreeId, result.previous, result.next)
      return false
    }
  },

  clearDiffCommentsForFile: async (worktreeId, filePath) => {
    const result = mutateDiffComments(worktreeId, (existing) => {
      const next = existing.filter((c) => c.filePath !== filePath)
      return next.length === existing.length ? null : next
    })
    if (!result) {
      return true
    }
    try {
      await enqueueDiffCommentPersistence(worktreeId)
      return true
    } catch (err) {
      console.error('Failed to persist diff comments:', err)
      rollbackDiffComments(worktreeId, result.previous, result.next)
      return false
    }
  }
})
