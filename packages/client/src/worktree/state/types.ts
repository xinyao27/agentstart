import type { TuiAgent } from '@agentstart/protocol/agent/types'
import type { GitPushTarget } from '@agentstart/protocol/git/worktree-source'
import type { WorkspaceKey } from '@agentstart/protocol/workspace/identity'
import type { WorkspaceSource as WorkspaceCreateTelemetrySource } from '@agentstart/protocol/workspace/source'
import type { WorkspaceStatus } from '@agentstart/protocol/workspace/status/model'
import type {
  CreateWorktreeResult,
  ForceDeleteWorktreeBranchResult,
  RemoveWorktreeResult,
  WorktreeBaseStatusEvent
} from '@agentstart/protocol/worktree/create-result'
import type { SetupDecision } from '@agentstart/protocol/worktree/hooks'
import type { WorkspaceLineage, WorktreeLineage } from '@agentstart/protocol/worktree/lineage'
import type {
  DetectedWorktreeListResult,
  DetectedWorktree,
  Worktree,
  WorktreeMeta
} from '@agentstart/protocol/worktree/model'
import type { CreateSparseCheckoutRequest } from '@agentstart/protocol/worktree/sparse'
import type { TerminalGitHubPRLink } from '~renderer/runtime/terminal-side-effect-client'
import type { PendingWorktreeCreation } from '~renderer/worktree-creation/pending'
import type { WorktreeStartupLaunch } from '~renderer/worktree/create-model'
import type { WorktreeForceDeleteReason } from '~renderer/worktree/removal-policy'
export { getRepoIdFromWorktreeId } from '@agentstart/protocol/worktree/identity'

export type WorktreeDeleteState = {
  isDeleting: boolean
  phase?: 'deleting' | 'queued'
  error: string | null
  canForceDelete: boolean
  forceDeleteReason: WorktreeForceDeleteReason | null
  lockReason?: string | null
}

type WorktreeMetaUpdateGuard = (worktree: Worktree | DetectedWorktree | undefined) => boolean

type WorktreeMetaUpdateOptions = {
  shouldApply?: WorktreeMetaUpdateGuard
  /** Skip the automatic review refetch when the caller owns an equivalent refresh. */
  suppressHostedReviewRefresh?: boolean
}

type WorktreeRenameRequest = {
  worktreeId: string
  rowKey?: string
}

export type WorktreeSlice = {
  worktreesByRepo: Record<string, Worktree[]>
  detectedWorktreesByRepo: Record<string, DetectedWorktreeListResult>
  worktreeLineageById: Record<string, WorktreeLineage>
  workspaceLineageByChildKey: Record<WorkspaceKey, WorkspaceLineage>
  activeWorktreeId: string | null
  activeWorkspaceKey: WorkspaceKey | null
  /**
   * In-flight / failed background worktree creations, keyed by a renderer
   * `creationId`. Kept separate from `worktreesByRepo` on purpose — a real
   * worktree row only exists once `git worktree add` succeeds, so faking one
   * here would ripple through git-status, the tab model, persistence, and PTY
   * spawning. Session-only; never persisted.
   */
  pendingWorktreeCreations: Record<string, PendingWorktreeCreation>
  /**
   * The pending creation currently filling the workspace content area (the
   * "Creating worktree…" panel). Distinct from `activeWorktreeId`, which stays
   * strictly real, so navigating to/away from a pending creation never routes a
   * fake id through `setActiveWorktree` or nav-history.
   */
  activePendingCreationId: string | null
  // Why: signals the matching worktree card's inline title editor to open. The
  // workspace.rename shortcut sets this; the card clears it on consume.
  renamingWorktreeId: WorktreeRenameRequest | null
  deleteStateByWorktreeId: Record<string, WorktreeDeleteState>
  baseStatusByWorktreeId: Record<string, WorktreeBaseStatusEvent>
  /**
   * Monotonically increasing counter that signals when the sidebar sort order
   * should be recomputed.  Only bumped by events that represent meaningful
   * external changes (worktree add/remove, terminal activity, backend refresh)
   * — NOT by selection-triggered side-effects like clearing `isUnread`.
   */
  sortEpoch: number
  /**
   * Worktree IDs that have been activated at least once during this app
   * session. The first activation of a worktree is special: its
   * TerminalPane mounts for the first time, tabs reattach or fresh-spawn
   * their PTYs, and the resulting `updateTabPtyId`/`clearTabPtyId` calls
   * are all side-effects of the click — not real activity. On first
   * activation we tag every terminal tab with `pendingActivationSpawn` so
   * the bump is suppressed. Split-layout tabs may carry a numeric count so
   * every click-driven pane remount is suppressed. After the first activation
   * we do NOT re-tag, so subsequent events on the worktree (codex restart,
   * new pane spawn, agent output) count normally. Session-only; never persisted.
   */
  everActivatedWorktreeIds: Set<string>
  /**
   * Persisted focus-recency timestamp per worktree, used as the primary
   * ordering signal for the Command Palette's empty-query Worktrees section. Stamped by
   * `markWorktreeVisited` from user-initiated activations
   * (activateAndRevealWorktree), NOT from background activity events or raw
   * `setActiveWorktree` calls. See docs/cmd-j-empty-query-ordering.md.
   */
  lastVisitedAtByWorktreeId: Record<string, number>
  /** Guards the one-shot purge after every repo has an authoritative worktree catalog. */
  hasHydratedWorktreePurge: boolean
  completeHydratedWorktreePurge: () => void
  updateWorktreeLineage: (
    worktreeId: string,
    args: { parentWorktreeId?: string; noParent?: boolean }
  ) => Promise<void>
  assignWorktreeParent: (worktreeId: string, args: { parentWorktreeId: string }) => Promise<void>
  createWorktree: (
    repoId: string,
    name: string,
    baseBranch?: string,
    setupDecision?: SetupDecision,
    sparseCheckout?: CreateSparseCheckoutRequest,
    /** Telemetry-only: which renderer surface initiated this create. Optional
     *  so existing callers default to `unknown`; specify when the surface
     *  matters for the activation funnel. */
    telemetrySource?: WorkspaceCreateTelemetrySource,
    displayName?: string,
    linkedPR?: number,
    pushTarget?: GitPushTarget,
    createdWithAgent?: TuiAgent,
    branchNameOverride?: string,
    workspaceStatus?: WorkspaceStatus,
    startup?: WorktreeStartupLaunch,
    pendingFirstAgentMessageRename?: boolean,
    /** When set, correlates the backend's `createWorktree:progress` events to a
     *  renderer pending creation. Synchronous callers omit it. */
    creationId?: string,
    compareBaseRef?: string
  ) => Promise<CreateWorktreeResult>
  /** Register an in-flight background creation and make it the active surface. */
  beginPendingWorktreeCreation: (entry: PendingWorktreeCreation) => void
  /** Merge a status patch into an existing pending entry. */
  updatePendingWorktreeCreation: (
    creationId: string,
    patch: Partial<
      Pick<
        PendingWorktreeCreation,
        | 'copiedFileCount'
        | 'error'
        | 'loaderVisible'
        | 'phase'
        | 'request'
        | 'setupConfigured'
        | 'startedAt'
        | 'status'
      >
    >
  ) => void
  /** Drop a pending entry, clearing the active surface if it pointed at this
   *  creation. */
  removePendingWorktreeCreation: (creationId: string) => void
  /** Point the content panel at a pending creation (or clear it with null). */
  setActivePendingWorktreeCreation: (creationId: string | null) => void
  prefetchWorktreeCreateBase: (repoId: string, baseBranch?: string) => Promise<void>
  removeWorktree: (
    worktreeId: string,
    force?: boolean,
    options?: {
      suppressPreservedBranchToast?: boolean
    }
  ) => Promise<({ ok: true } & RemoveWorktreeResult) | { ok: false; error: string }>
  markWorktreesDeleting: (worktreeIds: readonly string[]) => void
  markWorktreesQueuedForDeletion: (worktreeIds: readonly string[]) => void
  forceDeletePreservedBranch: (
    worktreeId: string,
    branchName: string,
    expectedHead: string
  ) => Promise<({ ok: true } & ForceDeleteWorktreeBranchResult) | { ok: false; error: string }>
  /** Full CLI output of the last branch auto-rename generation failure, held
   *  in main memory only on whichever host owns the worktree. */
  getWorktreeBranchRenameFailureOutput: (worktreeId: string) => Promise<string | null>
  clearWorktreeDeleteState: (worktreeId: string) => void
  updateWorktreeMeta: (
    worktreeId: string,
    updates: Partial<WorktreeMeta>,
    options?: WorktreeMetaUpdateOptions
  ) => Promise<void>
  ensureHostedReviewPushTarget: (worktreeId: string) => Promise<void>
  updateWorktreesMeta: (
    updatesByWorktreeId: ReadonlyMap<string, Partial<WorktreeMeta>>
  ) => Promise<void>
  /**
   * Pin/unpin worktrees, then reveal the first changed one. The reveal keeps
   * the shortcut action visible even though pinned worktrees also remain in
   * their normal sidebar groups.
   */
  setWorktreesPinnedAndReveal: (worktreeIds: readonly string[], isPinned: boolean) => void
  markWorktreeUnread: (worktreeId: string) => void
  observeTerminalGitHubPullRequestLink: (worktreeId: string, link: TerminalGitHubPRLink) => void
  /** Clear the worktree's unread dot. Called on user interaction with any
   *  terminal pane inside the worktree (keystroke, click) — matches
   *  ghostty's "show until interact" model. Persists isUnread=false. */
  clearWorktreeUnread: (worktreeId: string) => void
  bumpWorktreeActivity: (worktreeId: string) => void
  /**
   * Monotonic stamp of the focus-recency timestamp for a worktree. No-op if
   * the supplied (or current) timestamp is not strictly greater than the
   * stored value. Called from user-initiated activations only. See
   * docs/cmd-j-empty-query-ordering.md.
   */
  markWorktreeVisited: (worktreeId: string, visitedAt?: number) => void
  /**
   * Drop `lastVisitedAtByWorktreeId` entries whose worktree IDs no longer
   * exist. Must be called AFTER worktree hydration completes — repos load
   * async, so pruning on raw rehydrate would nuke timestamps for worktrees
   * whose repo hasn't yet hydrated.
   */
  pruneLastVisitedTimestamps: () => void
  /**
   * One-shot migration fixup: if the active worktree has no stored
   * focus-recency timestamp after session hydration, seed it with the
   * current time. Different semantics from `markWorktreeVisited` — this
   * only fills in a missing entry on first load, it does not record a
   * fresh visit.
   */
  seedActiveWorktreeLastVisitedIfMissing: () => void
  setActiveWorktree: (worktreeId: string | null) => void
  /**
   * Health-driven remount of one terminal tab: bumps the tab's generation so
   * TerminalPane unmounts, detaches (preserving a live PTY), and remounts with
   * a fresh xterm that reattaches and replays. Used by terminal-pane-recovery
   * when a pane's write pipeline is certified dead or its input is
   * undeliverable while the PTY is alive. Returns false when the tab is gone.
   */
  remountTerminalTabForRecovery: (tabId: string) => boolean
  setActiveFolderWorkspace: (folderWorkspaceId: string) => void
  setRenamingWorktreeId: (request: string | WorktreeRenameRequest | null) => void
  allWorktrees: () => Worktree[]
  getKnownWorktreeById: (worktreeId: string) => Worktree | DetectedWorktree | undefined
  /**
   * Wipes every terminal- and worktree-scoped map entry for each given id.
   * Called by the `worktrees:changed` listener on server-side deletions and
   * one-shot at hydration time. See design §4.4.
   */
  purgeWorktreeTerminalState: (worktreeIds: string[]) => void
  /**
   * Re-key every worktree-scoped map + pointer from `oldWorktreeId` to
   * `newWorktreeId` after a folder rename changed the worktree's path-derived id.
   * The inverse of purge: move state instead of dropping it, so the live worktree
   * keeps its tabs, terminals, and selections. No-op when the ids match.
   */
  migrateWorktreeIdentity: (oldWorktreeId: string, newWorktreeId: string) => void
  updateWorktreeGitIdentity: (
    worktreeId: string,
    identity: { head?: string; branch?: string | null }
  ) => void
  updateWorktreeBaseStatus: (event: WorktreeBaseStatusEvent) => void
}

export function findWorktreeById(
  worktreesByRepo: Record<string, Worktree[]>,
  worktreeId: string
): Worktree | undefined {
  for (const worktrees of Object.values(worktreesByRepo)) {
    const match = worktrees.find((worktree) => worktree.id === worktreeId)
    if (match) {
      return match
    }
  }

  return undefined
}
