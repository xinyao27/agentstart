import type { StateCreator } from 'zustand'
import type { AppState } from '~renderer/store/types'

export type SourceControlPanelView = 'changes' | 'review'

export type SourceControlPanelViewSlice = {
  requestedSourceControlPanelView: SourceControlPanelView
  sourceControlPanelViewByWorktree: Record<string, SourceControlPanelView>
  requestSourceControlPanelView: (view: SourceControlPanelView) => void
  setSourceControlPanelView: (worktreeId: string, view: SourceControlPanelView) => void
  clearSourceControlPanelView: (worktreeId: string) => void
}

export const createSourceControlPanelViewSlice: StateCreator<
  AppState,
  [],
  [],
  SourceControlPanelViewSlice
> = (set) => ({
  requestedSourceControlPanelView: 'changes',
  sourceControlPanelViewByWorktree: {},
  requestSourceControlPanelView: (view) =>
    set((state) => ({
      requestedSourceControlPanelView: view,
      ...(state.activeWorktreeId
        ? {
            sourceControlPanelViewByWorktree: {
              ...state.sourceControlPanelViewByWorktree,
              [state.activeWorktreeId]: view
            }
          }
        : {})
    })),
  setSourceControlPanelView: (worktreeId, view) =>
    set((state) => ({
      sourceControlPanelViewByWorktree: {
        ...state.sourceControlPanelViewByWorktree,
        [worktreeId]: view
      }
    })),
  clearSourceControlPanelView: (worktreeId) =>
    set((state) => {
      if (!(worktreeId in state.sourceControlPanelViewByWorktree)) {
        return state
      }
      const next = { ...state.sourceControlPanelViewByWorktree }
      delete next[worktreeId]
      return { sourceControlPanelViewByWorktree: next }
    })
})
