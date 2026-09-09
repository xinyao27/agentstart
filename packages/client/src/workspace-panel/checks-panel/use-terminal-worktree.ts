import type { Worktree } from '@yiru/protocol/worktree/model'

type ChecksPanelTerminalWorktree = {
  worktree: Worktree | null
}

export function useChecksPanelTerminalWorktree(args: {
  defaultActiveWorktree: Worktree | null
  isPanelVisible: boolean
}): ChecksPanelTerminalWorktree {
  // Why: terminal cwd now arrives inside the multiplex stream instead of a
  // second preload query. Until the checks feature consumes that pane-local
  // state, keep its selection pinned to the active worktree.
  return { worktree: args.defaultActiveWorktree }
}
