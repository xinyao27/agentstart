import type { GitHistoryItem, GitHistoryResult } from '@agentstart/protocol/git/history-types'
import type { StateCreator } from 'zustand'
import { translate } from '~renderer/i18n/i18n'
import { getRepoOwnerRoutedSettings } from '~renderer/repo/runtime-owner'
import { getConnectionId } from '~renderer/runtime/connection-context'
import { getRuntimeGitHistory } from '~renderer/runtime/git-client'
import { getRepoMapFromState, getWorktreeMapFromState } from '~renderer/store/selectors'
import type { AppState } from '~renderer/store/types'

import type { GitGraphColumnWidths } from './column-widths'

export type GitGraphState =
  | { status: 'idle' | 'loading'; result?: GitHistoryResult; error?: string }
  | { status: 'refreshing' | 'ready'; result: GitHistoryResult; error?: string }
  | { status: 'error'; result?: GitHistoryResult; error: string }
  // Why: distinct from 'refreshing' so the footer can show a "Loading more…"
  // affordance on the sentinel button/row instead of replacing the whole list.
  | { status: 'loading-more'; result: GitHistoryResult; error?: string }

export const EMPTY_GIT_GRAPH_STATE: GitGraphState = { status: 'idle' }

export type GitGraphSlice = {
  gitGraphByWorktree: Record<string, GitGraphState>
  gitGraphIncludeRemoteBranchesByWorktree: Record<string, boolean>
  // Why: null means "show all" (no branch filter applied yet) — distinct from an
  // empty array, which would mute every commit.
  gitGraphSelectedRefIdsByWorktree: Record<string, string[] | null>
  gitGraphColumnWidthsByWorktree: Record<string, GitGraphColumnWidths>
  refreshGitGraph: (worktreeId: string) => Promise<void>
  loadMoreGitGraph: (worktreeId: string) => Promise<void>
  setGitGraphIncludeRemoteBranches: (worktreeId: string, include: boolean) => void
  setGitGraphSelectedRefIds: (worktreeId: string, refIds: string[] | null) => void
  setGitGraphColumnWidths: (worktreeId: string, widths: GitGraphColumnWidths) => void
}

// Why: request sequencing lives outside zustand state (like the former
// per-worktree refs in the source-control controller) so a stale response
// can be dropped without triggering a render for the counter itself.
const gitGraphRequestSeqByWorktree: Record<string, number> = {}

function dedupeGitHistoryItems(
  existing: readonly GitHistoryItem[],
  appended: readonly GitHistoryItem[]
): GitHistoryItem[] {
  const seen = new Set(existing.map((item) => item.id))
  const next = existing.slice()
  for (const item of appended) {
    if (seen.has(item.id)) {
      continue
    }
    seen.add(item.id)
    next.push(item)
  }
  return next
}

export const createGitGraphSlice: StateCreator<AppState, [], [], GitGraphSlice> = (set, get) => ({
  gitGraphByWorktree: {},
  gitGraphIncludeRemoteBranchesByWorktree: {},
  gitGraphSelectedRefIdsByWorktree: {},
  gitGraphColumnWidthsByWorktree: {},
  setGitGraphIncludeRemoteBranches: (worktreeId, include) => {
    set((state) => ({
      gitGraphIncludeRemoteBranchesByWorktree: {
        ...state.gitGraphIncludeRemoteBranchesByWorktree,
        [worktreeId]: include
      }
    }))
    void get().refreshGitGraph(worktreeId)
  },
  setGitGraphSelectedRefIds: (worktreeId, refIds) =>
    set((state) => ({
      gitGraphSelectedRefIdsByWorktree: {
        ...state.gitGraphSelectedRefIdsByWorktree,
        [worktreeId]: refIds
      }
    })),
  setGitGraphColumnWidths: (worktreeId, widths) =>
    set((state) => ({
      gitGraphColumnWidthsByWorktree: {
        ...state.gitGraphColumnWidthsByWorktree,
        [worktreeId]: widths
      }
    })),
  refreshGitGraph: async (worktreeId) => {
    const state = get()
    const worktree = getWorktreeMapFromState(state).get(worktreeId)
    if (!worktree) {
      return
    }
    const repo = getRepoMapFromState(state).get(worktree.repoId) ?? null
    // Why: route the history read by the repo OWNER host, not the focused
    // runtime — matches source-control's branch-compare/history fetch.
    const activeRepoSettings = getRepoOwnerRoutedSettings(state.settings, repo)
    // Why: reuse the compare base ref the source-control branch-compare flow
    // already resolved for this worktree (worktree/repo base ref, upstream,
    // and the async repo default all folded in there) instead of
    // re-deriving that resolution chain from inside a store action.
    const baseRef = state.gitBranchCompareSummaryByWorktree[worktreeId]?.baseRef ?? null
    const includeRemoteBranches = state.gitGraphIncludeRemoteBranchesByWorktree[worktreeId] ?? true
    const requestId = (gitGraphRequestSeqByWorktree[worktreeId] ?? 0) + 1
    gitGraphRequestSeqByWorktree[worktreeId] = requestId
    set((current) => {
      const previous = current.gitGraphByWorktree[worktreeId]
      return {
        gitGraphByWorktree: {
          ...current.gitGraphByWorktree,
          [worktreeId]: previous?.result
            ? { status: 'refreshing', result: previous.result }
            : { status: 'loading' }
        }
      }
    })
    try {
      const connectionId = getConnectionId(worktreeId) ?? undefined
      // Why: a graph showing only HEAD's ancestry defeats the purpose of a
      // multi-branch view, so this always walks every ref, not just HEAD.
      const result = await getRuntimeGitHistory(
        {
          settings: activeRepoSettings,
          worktreeId,
          worktreePath: worktree.path,
          connectionId
        },
        { limit: 50, baseRef, refScope: 'all', includeRemoteBranches, skip: 0 }
      )
      if (gitGraphRequestSeqByWorktree[worktreeId] !== requestId) {
        return
      }
      set((current) => ({
        gitGraphByWorktree: {
          ...current.gitGraphByWorktree,
          [worktreeId]: { status: 'ready', result }
        }
      }))
    } catch (error) {
      if (gitGraphRequestSeqByWorktree[worktreeId] !== requestId) {
        return
      }
      const message =
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.workspace-panel.GitGraphState.f3a2c1d0e5',
              'Failed to load commits'
            )
      set((current) => {
        const previous = current.gitGraphByWorktree[worktreeId]
        return {
          gitGraphByWorktree: {
            ...current.gitGraphByWorktree,
            [worktreeId]: previous?.result
              ? { status: 'error', result: previous.result, error: message }
              : { status: 'error', error: message }
          }
        }
      })
    }
  },
  loadMoreGitGraph: async (worktreeId) => {
    const state = get()
    const current = state.gitGraphByWorktree[worktreeId]
    if (!current?.result || !current.result.hasMore || current.status === 'loading-more') {
      return
    }
    const worktree = getWorktreeMapFromState(state).get(worktreeId)
    if (!worktree) {
      return
    }
    const repo = getRepoMapFromState(state).get(worktree.repoId) ?? null
    const activeRepoSettings = getRepoOwnerRoutedSettings(state.settings, repo)
    const baseRef = state.gitBranchCompareSummaryByWorktree[worktreeId]?.baseRef ?? null
    const includeRemoteBranches = state.gitGraphIncludeRemoteBranchesByWorktree[worktreeId] ?? true
    const previousResult = current.result
    const requestId = (gitGraphRequestSeqByWorktree[worktreeId] ?? 0) + 1
    gitGraphRequestSeqByWorktree[worktreeId] = requestId
    set((s) => ({
      gitGraphByWorktree: {
        ...s.gitGraphByWorktree,
        [worktreeId]: { status: 'loading-more', result: previousResult }
      }
    }))
    try {
      const connectionId = getConnectionId(worktreeId) ?? undefined
      const page = await getRuntimeGitHistory(
        {
          settings: activeRepoSettings,
          worktreeId,
          worktreePath: worktree.path,
          connectionId
        },
        {
          limit: 50,
          baseRef,
          refScope: 'all',
          includeRemoteBranches,
          skip: previousResult.items.length
        }
      )
      if (gitGraphRequestSeqByWorktree[worktreeId] !== requestId) {
        return
      }
      set((s) => ({
        gitGraphByWorktree: {
          ...s.gitGraphByWorktree,
          [worktreeId]: {
            status: 'ready',
            result: {
              ...page,
              items: dedupeGitHistoryItems(previousResult.items, page.items)
            }
          }
        }
      }))
    } catch (error) {
      if (gitGraphRequestSeqByWorktree[worktreeId] !== requestId) {
        return
      }
      const message =
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.workspace-panel.GitGraphState.a4b5c6d7e8',
              'Failed to load more commits'
            )
      set((s) => ({
        gitGraphByWorktree: {
          ...s.gitGraphByWorktree,
          [worktreeId]: { status: 'error', result: previousResult, error: message }
        }
      }))
    }
  }
})
