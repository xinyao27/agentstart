import type { GitPushTarget } from '@agentstart/protocol/git/worktree-source'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { fetchRuntimeGit } from '~renderer/runtime/git-client'
import { resolveSourceControlOperationOwner } from '~renderer/source-control/operation-owner'
import type { AppState } from '~renderer/store/types'

import {
  resolveSourceControlOperationFollowUp,
  type SourceControlRemoteOperationOutcome
} from '../source-control/workflow/operation'
import type { SourceControlRemoteOpKind } from '../source-control/workflow/types'

export type RemoteOperationFollowUpArgs = {
  operation: SourceControlRemoteOpKind
  outcome: SourceControlRemoteOperationOutcome
  worktreeId: string
  worktreePath: string
  connectionId?: string | null
  pushTarget?: GitPushTarget
  runtimeSettings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null
  syncPushed?: boolean
}

export function applyRemoteOperationFollowUp(
  get: () => AppState,
  args: RemoteOperationFollowUpArgs
): void {
  const followUp = resolveSourceControlOperationFollowUp({
    operation: args.operation,
    outcome: args.outcome,
    syncPushed: args.syncPushed
  })
  const runtimeContext = {
    settings: args.runtimeSettings,
    worktreeId: args.worktreeId,
    worktreePath: args.worktreePath,
    connectionId: args.connectionId ?? undefined
  }
  const refreshUpstream = () =>
    get().fetchUpstreamStatus(
      args.worktreeId,
      args.worktreePath,
      args.connectionId ?? undefined,
      args.pushTarget,
      { runtimeTargetSettings: args.runtimeSettings }
    )

  if (followUp.recovery === 'fetch_then_refresh_upstream') {
    // Why: a rejected push proves the remote moved. Fetch on the same native,
    // WSL, or SSH runtime before refreshing counts so Pull/Sync is actionable.
    void fetchRuntimeGit(runtimeContext, args.pushTarget)
      .catch(() => undefined)
      .then(refreshUpstream)
    return
  }
  if (followUp.statusRefresh) {
    void refreshUpstream()
  }
  if (followUp.refreshHostedReview) {
    refreshHostedReviewAfterRemoteOperation(get(), args)
  }
}

function refreshHostedReviewAfterRemoteOperation(
  state: AppState,
  args: Pick<
    RemoteOperationFollowUpArgs,
    'worktreeId' | 'worktreePath' | 'connectionId' | 'runtimeSettings'
  >
): void {
  const owner = resolveSourceControlOperationOwner(state, args)
  if (!owner) {
    return
  }
  const { worktree, repo, executionHostId } = owner
  if (worktree.branch && typeof state.fetchHostedReviewForBranch === 'function') {
    void state.fetchHostedReviewForBranch(repo.path, worktree.branch, {
      force: true,
      repoId: repo.id,
      executionHostId,
      linkedGitHubPR: worktree.linkedPR
    })
  }
  // GitHub's richer cache also owns checks/review details beyond the neutral card.
  if (typeof state.refreshGitHubForWorktree === 'function') {
    state.refreshGitHubForWorktree(args.worktreeId, executionHostId)
  }
}
