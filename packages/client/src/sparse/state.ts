import type { SparsePreset } from '@yiru/protocol/worktree/create-result'
import type { StateCreator } from 'zustand'
import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'
import { requireRepoProtocolClient } from '~renderer/runtime/repo-catalog-target'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'

import type { AppState } from '../store/types'

export type SparsePresetsLoadStatus = 'idle' | 'loading' | 'loaded' | 'error'

export type SparsePresetsSlice = {
  /** Per-repo preset list. Lazily populated by `fetchSparsePresets`; missing
   *  key means "not yet fetched", empty array means "fetched, none exist". */
  sparsePresetsByRepo: Record<string, SparsePreset[]>
  /** Per-repo fetch guard so missing preset buckets keep their loading meaning. */
  sparsePresetsLoadingByRepo: Record<string, boolean>
  sparsePresetsLoadStatusByRepo: Record<string, SparsePresetsLoadStatus>
  sparsePresetsErrorByRepo: Record<string, string | undefined>
  fetchSparsePresets: (repoId: string) => Promise<void>
  saveSparsePreset: (args: {
    repoId: string
    id?: string
    name: string
    directories: string[]
  }) => Promise<SparsePreset | null>
  removeSparsePreset: (args: { repoId: string; presetId: string }) => Promise<void>
}

type SparsePresetsMaps = Pick<
  AppState,
  | 'sparsePresetsByRepo'
  | 'sparsePresetsLoadingByRepo'
  | 'sparsePresetsLoadStatusByRepo'
  | 'sparsePresetsErrorByRepo'
>

// Why: the four per-repo sparse-preset maps are populated lazily per repo but
// were never pruned when a repo was removed, so orphaned entries accumulated for
// the renderer's whole session. Call this from the repo-removal reducers to drop
// entries for repos that no longer exist. Returns only the maps that changed so
// unrelated selectors don't re-run.
export function omitSparsePresetsForRepos(
  s: SparsePresetsMaps,
  removedRepoIds: Iterable<string>
): Partial<AppState> {
  const removed = removedRepoIds instanceof Set ? removedRepoIds : new Set(removedRepoIds)
  if (removed.size === 0) {
    return {}
  }
  const omit = <T>(obj: Record<string, T>): Record<string, T> => {
    let changed = false
    const out = { ...obj }
    for (const id of removed) {
      if (id in out) {
        delete out[id]
        changed = true
      }
    }
    return changed ? out : obj
  }
  const result: Partial<AppState> = {}
  const byRepo = omit(s.sparsePresetsByRepo)
  if (byRepo !== s.sparsePresetsByRepo) {
    result.sparsePresetsByRepo = byRepo
  }
  const loading = omit(s.sparsePresetsLoadingByRepo)
  if (loading !== s.sparsePresetsLoadingByRepo) {
    result.sparsePresetsLoadingByRepo = loading
  }
  const status = omit(s.sparsePresetsLoadStatusByRepo)
  if (status !== s.sparsePresetsLoadStatusByRepo) {
    result.sparsePresetsLoadStatusByRepo = status
  }
  const error = omit(s.sparsePresetsErrorByRepo)
  if (error !== s.sparsePresetsErrorByRepo) {
    result.sparsePresetsErrorByRepo = error
  }
  return result
}

export const createSparsePresetsSlice: StateCreator<AppState, [], [], SparsePresetsSlice> = (
  set,
  get
) => ({
  sparsePresetsByRepo: {},
  sparsePresetsLoadingByRepo: {},
  sparsePresetsLoadStatusByRepo: {},
  sparsePresetsErrorByRepo: {},

  fetchSparsePresets: async (repoId) => {
    const state = get()
    if (
      state.sparsePresetsByRepo[repoId] !== undefined ||
      state.sparsePresetsLoadingByRepo[repoId]
    ) {
      return
    }
    set((s) => ({
      sparsePresetsLoadingByRepo: { ...s.sparsePresetsLoadingByRepo, [repoId]: true },
      sparsePresetsLoadStatusByRepo: { ...s.sparsePresetsLoadStatusByRepo, [repoId]: 'loading' },
      sparsePresetsErrorByRepo: { ...s.sparsePresetsErrorByRepo, [repoId]: undefined }
    }))
    try {
      const { presets } = await (
        await requireRepoProtocolClient(getActiveRuntimeTarget(get().settings))
      ).sparsePresets({ repo: repoId })
      set((s) => ({
        sparsePresetsByRepo: { ...s.sparsePresetsByRepo, [repoId]: presets },
        sparsePresetsLoadingByRepo: { ...s.sparsePresetsLoadingByRepo, [repoId]: false },
        sparsePresetsLoadStatusByRepo: { ...s.sparsePresetsLoadStatusByRepo, [repoId]: 'loaded' },
        sparsePresetsErrorByRepo: { ...s.sparsePresetsErrorByRepo, [repoId]: undefined }
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set((s) => ({
        sparsePresetsLoadingByRepo: { ...s.sparsePresetsLoadingByRepo, [repoId]: false },
        sparsePresetsLoadStatusByRepo: { ...s.sparsePresetsLoadStatusByRepo, [repoId]: 'error' },
        sparsePresetsErrorByRepo: { ...s.sparsePresetsErrorByRepo, [repoId]: message }
      }))
      console.error(`Failed to fetch sparse presets for repo ${repoId}:`, err)
    }
  },

  saveSparsePreset: async (args) => {
    try {
      if (get().sparsePresetsByRepo[args.repoId] === undefined) {
        // Why: a saved preset alone is not an authoritative repo bucket; load
        // existing presets first so we do not hide them behind a one-item cache.
        await get().fetchSparsePresets(args.repoId)
        if (get().sparsePresetsByRepo[args.repoId] === undefined) {
          publishRendererCommandResult({
            type: 'sparse-preset',
            operation: args.id ? 'update' : 'save',
            outcome: 'blocked'
          })
          return null
        }
      }
      const { preset: saved } = await (
        await requireRepoProtocolClient(getActiveRuntimeTarget(get().settings))
      ).saveSparsePreset({
        repo: args.repoId,
        ...(args.id ? { id: args.id } : {}),
        name: args.name,
        directories: args.directories
      })
      set((s) => {
        const existing = s.sparsePresetsByRepo[args.repoId]
        if (existing === undefined) {
          return {}
        }
        const without = existing.filter((preset) => preset.id !== saved.id)
        return {
          sparsePresetsByRepo: {
            ...s.sparsePresetsByRepo,
            [args.repoId]: [...without, saved].sort((left, right) =>
              left.name.localeCompare(right.name)
            )
          }
        }
      })
      publishRendererCommandResult({
        type: 'sparse-preset',
        operation: args.id ? 'update' : 'save',
        outcome: 'succeeded',
        name: saved.name
      })
      return saved
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      publishRendererCommandResult({
        type: 'sparse-preset',
        operation: args.id ? 'update' : 'save',
        outcome: 'failed',
        error: message
      })
      return null
    }
  },

  removeSparsePreset: async ({ repoId, presetId }) => {
    const previous = get().sparsePresetsByRepo[repoId] ?? []
    // Why: optimistic local update keeps the popover responsive; failure restores it.
    set((s) => ({
      sparsePresetsByRepo: {
        ...s.sparsePresetsByRepo,
        [repoId]: previous.filter((preset) => preset.id !== presetId)
      }
    }))
    try {
      await (
        await requireRepoProtocolClient(getActiveRuntimeTarget(get().settings))
      ).removeSparsePreset({ repo: repoId, presetId })
      publishRendererCommandResult({
        type: 'sparse-preset',
        operation: 'remove',
        outcome: 'succeeded'
      })
    } catch (err) {
      set((s) => ({
        sparsePresetsByRepo: { ...s.sparsePresetsByRepo, [repoId]: previous }
      }))
      const message = err instanceof Error ? err.message : String(err)
      publishRendererCommandResult({
        type: 'sparse-preset',
        operation: 'remove',
        outcome: 'failed',
        error: message
      })
      // Why: settings UI keeps confirmation/edit state until persistence succeeds.
      throw err
    }
  }
})
