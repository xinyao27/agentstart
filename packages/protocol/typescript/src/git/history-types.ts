export type GitHistoryGraphColorId =
  | 'git-graph-ref'
  | 'git-graph-remote-ref'
  | 'git-graph-base-ref'
  | 'git-graph-lane-1'
  | 'git-graph-lane-2'
  | 'git-graph-lane-3'
  | 'git-graph-lane-4'
  | 'git-graph-lane-5'

export const GIT_HISTORY_REF_COLOR: GitHistoryGraphColorId = 'git-graph-ref'
export const GIT_HISTORY_REMOTE_REF_COLOR: GitHistoryGraphColorId = 'git-graph-remote-ref'
export const GIT_HISTORY_BASE_REF_COLOR: GitHistoryGraphColorId = 'git-graph-base-ref'

export const GIT_HISTORY_LANE_COLORS: readonly GitHistoryGraphColorId[] = [
  'git-graph-lane-1',
  'git-graph-lane-2',
  'git-graph-lane-3',
  'git-graph-lane-4',
  'git-graph-lane-5'
]

export const GIT_HISTORY_DEFAULT_LIMIT = 50
export const GIT_HISTORY_MAX_LIMIT = 200

export type GitHistoryRefCategory = 'head' | 'branches' | 'remote branches' | 'tags' | 'commits'

export type GitHistoryItemRef = {
  id: string
  name: string
  revision?: string
  category?: GitHistoryRefCategory
  description?: string
  color?: GitHistoryGraphColorId
  // Why: only populated for `category: 'remote branches'` — the remote name
  // segment of `refs/remotes/<remote>/<branch>`, so a graph UI can group or
  // badge remote branches by remote without re-parsing `id`.
  remoteName?: string
  // Why: only populated for `category: 'branches'` — true for the local
  // branch that HEAD currently points at (`HEAD -> refs/heads/<name>` in the
  // decoration), so a graph UI can render the checked-out branch distinctly
  // without a second lookup against `GitHistoryResult.currentRef`.
  isCheckedOut?: boolean
}

export type GitHistoryItemStatistics = {
  files: number
  insertions: number
  deletions: number
}

export type GitHistoryItem = {
  id: string
  parentIds: string[]
  subject: string
  message: string
  displayId?: string
  author?: string
  authorEmail?: string
  timestamp?: number
  statistics?: GitHistoryItemStatistics
  references?: GitHistoryItemRef[]
}

// Why: 'head' (default) preserves today's HEAD-ancestry-only walk; 'all' walks
// every local/remote branch and tag (plus HEAD, for a detached commit that is
// not an ancestor of any ref) for a Git-Graph-style all-branches view.
export type GitHistoryRefScope = 'head' | 'all'

export type GitHistoryOptions = {
  limit?: number
  baseRef?: string | null
  refScope?: GitHistoryRefScope
  // Why: only meaningful when refScope is 'all' — lets the UI's "Show Remote
  // Branches" switch drop `--remotes` from the walk instead of filtering
  // remote-branch refs out of the result after the fact. Defaults to true.
  includeRemoteBranches?: boolean
  // Why: offset-based "load more" (`git log --skip=N`). Simplest incremental
  // fetch available at the 2.25 baseline, but an offset can shift if refs
  // move (new commits land, branches get force-pushed) between calls — a
  // caller that needs stability across mutations should re-fetch from 0.
  skip?: number
}

export type GitHistoryResult = {
  items: GitHistoryItem[]
  currentRef?: GitHistoryItemRef
  remoteRef?: GitHistoryItemRef
  baseRef?: GitHistoryItemRef
  mergeBase?: string
  hasIncomingChanges: boolean
  hasOutgoingChanges: boolean
  hasMore: boolean
  limit: number
}

export type GitHistoryExecutor = (
  args: string[],
  cwd: string
) => Promise<{ stdout: string; stderr?: string }>
