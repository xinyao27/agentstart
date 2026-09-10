import type { TuiAgent } from '@agentstart/protocol/agent/types'
import type { GitPushTarget } from '@agentstart/protocol/git/worktree-source'
import type {
  ProjectSourceContext,
  WorkspaceRunContext
} from '@agentstart/protocol/project/source-context'
import type { WorkspaceSource as WorkspaceCreateTelemetrySource } from '@agentstart/protocol/workspace/source'
import type { WorkspaceStatus } from '@agentstart/protocol/workspace/status/model'
import type { SetupDecision } from '@agentstart/protocol/worktree/hooks'
import type { CreateSparseCheckoutRequest } from '@agentstart/protocol/worktree/sparse'
import type { AgentStartedTelemetry } from '~renderer/agent/started-telemetry'
import type { AgentStartupPlan } from '~renderer/agent/tui-startup'
import { translate } from '~renderer/i18n/i18n'
import type { WorktreeStartupLaunch } from '~renderer/worktree/create-model'

import type { WorktreeCreateProgressPhase } from './progress'

/** Two-phase status reported by the main process while a worktree is created.
 *  `preparing` covers renderer-side preflight before `createWorktree` starts;
 *  `fetching` covers the base-ref git fetch; `creating` covers `git worktree
 *  add`. Remote/runtime creates may skip git phases. */
export type WorktreeCreationPhase = WorktreeCreateProgressPhase

type WorktreeCreationProgressMode = 'stepped' | 'indeterminate'

/**
 * Everything needed to run a worktree create in the background and reproduce it
 * verbatim on retry. Captured at the composer's submit cut point — after all
 * interactive preflight (trust/setup decisions) has resolved — so the modal can
 * close immediately and the work outlives it. Must stay plain-serializable
 * (no closures/refs) so a pending entry can hold it for the panel's Retry.
 */
export type WorktreeCreationRequest = {
  repoId: string
  /** Source host/account that produced the linked review. Kept separate from the
   *  run context so Retry does not infer provider ownership from the run host. */
  projectSourceContext?: ProjectSourceContext | null
  /** Host/setup where the new workspace should run. Duplicates repoId by design:
   *  repoId keeps old create APIs working, while this records the project-first
   *  host intent for retry, diagnostics, and future metadata writes. */
  workspaceRunContext?: WorkspaceRunContext | null
  /** Captured from the repo/run owner at submit time so Retry keeps the same
   *  local-vs-runtime progress behavior even if the focused runtime changes. */
  worktreeCreateProgressMode?: WorktreeCreationProgressMode
  name: string
  displayName?: string
  baseBranch?: string
  compareBaseRef?: string
  setupDecision: SetupDecision
  sparseCheckout?: CreateSparseCheckoutRequest
  telemetrySource?: WorkspaceCreateTelemetrySource
  linkedPR?: number
  pushTarget?: GitPushTarget
  agent: TuiAgent | null
  branchNameOverride?: string
  workspaceStatus?: WorkspaceStatus
  /** Backend-spawn startup payload (`createWorktree` arg). Present only when the
   *  agent launch is self-contained; otherwise the renderer drives startup via
   *  `startupPlan`. */
  startup?: WorktreeStartupLaunch
  pendingFirstAgentMessageRename: boolean
  /** Post-create note persisted as the worktree comment. */
  note: string
  /** Renderer-side launch plan used to seed the first terminal when the backend
   *  did not already spawn it. Null for blank-shell creates. */
  startupPlan: AgentStartupPlan | null
  quickPrompt: string
  quickTelemetry: AgentStartedTelemetry | null
  /** When the composer stays open for sequential creates, completion must not
   *  steal focus from the next workspace name field. */
  suppressTerminalFocusOnCompletion?: boolean
}

/** Renderer-only, session-ephemeral record of an in-flight (or failed) worktree
 *  creation. Drives the sidebar strip and the in-tab creation panel. Never
 *  persisted — an app reload drops it and the worktree (if main finished it)
 *  reconciles in via the normal `worktrees:changed` refresh. Display fields
 *  (name, repo, agent) live on `request`, the single source of truth reused on
 *  retry. */
export type PendingWorktreeCreation = {
  creationId: string
  phase: WorktreeCreationPhase
  status: 'creating' | 'error'
  startedAt: number
  /** True when the create runs over a remote/runtime target that emits no phase
   *  progress — the panel shows a single indeterminate spinner rather than a
   *  stepped checklist that would freeze on the first step. */
  indeterminate: boolean
  /** Whether older callers have explicitly revealed the in-frame loader. New
   *  background creates set this immediately so the faux tab strip stays stable
   *  from create start through terminal handoff. */
  loaderVisible: boolean
  copiedFileCount?: number
  setupConfigured?: boolean
  error?: string
  request: WorktreeCreationRequest
}

/** Human-readable progress line for an in-flight create, shared by the in-frame
 *  loader and the sidebar row so the two never drift. Caller handles the error
 *  case; this only covers the in-progress states. */
export function getCreationProgressLabel(
  entry: Pick<PendingWorktreeCreation, 'phase' | 'indeterminate'>
): string {
  if (entry.indeterminate) {
    return translate(
      'auto.lib.pendingWorktreeCreation.settingUpWorkspace',
      'Setting up your workspace…'
    )
  }
  switch (entry.phase) {
    case 'preparing':
      return translate('auto.lib.pendingWorktreeCreation.preparing', 'Preparing workspace…')
    case 'fetching':
      return translate('auto.lib.pendingWorktreeCreation.fetching', 'Fetching base branch…')
    case 'creating':
      return translate('auto.lib.pendingWorktreeCreation.creating', 'Creating worktree…')
    case 'copying-files':
      return translate(
        'auto.lib.pendingWorktreeCreation.copyingFiles',
        'Copying environment files…'
      )
    case 'checking-setup':
      return translate('auto.lib.pendingWorktreeCreation.checkingSetup', 'Checking setup script…')
    case 'running-setup':
      return translate('auto.lib.pendingWorktreeCreation.runningSetup', 'Running setup script…')
    case 'starting-workspace':
      return translate('auto.lib.pendingWorktreeCreation.startingWorkspace', 'Starting workspace…')
  }
}
