import { resolveHostedReviewCreationProvider } from '@yiru/protocol/hosted-review/creation-provider'
import { getGitHubRepoCacheKey } from '~renderer/github/cache-key'
import { prChecksCacheSuffix, prCommentsCacheSuffix } from '~renderer/github/state'
import { localizedHostedReviewCopy } from '~renderer/i18n/hosted-review-localized-copy'
import { useAppStore } from '~renderer/store/state'

import {
  getPullRequestGenerationRecordKey,
  getPullRequestGenerationSeedRestoreKey,
  markPullRequestGenerationRequiresPushBeforeCreate,
  type PullRequestGenerationContext
} from '../pull-request-generation-state'
import {
  readChecksPanelPublishActionGitStatus,
  readChecksPanelGitStatusSnapshot
} from './git-status-snapshot'
import type { useChecksPanelReviewIdentityState } from './review-identity'

export function useChecksPanelReviewContext(context: useChecksPanelReviewIdentityState) {
  const {
    activeWorktreeId,
    activeWorktreePath,
    branch,
    fallbackGitHubPRNumber,
    fetchUpstreamStatus,
    gitStatusInvalidation,
    gitStatusSnapshot,
    hostedReviewCreationSnapshot,
    linkedPR,
    panelContextKey,
    pr,
    prCacheKey,
    prGenerationRecords,
    prNumber,
    remoteStatusInvalidation,
    repo,
    repoConnectionId,
    runtimeEnvironmentId,
    settings,
    updatePullRequestGenerationRecord
  } = context

  const prFetchedAt = useAppStore((s) =>
    prCacheKey ? s.prCache[prCacheKey]?.fetchedAt : undefined
  )
  const checksCacheKey =
    repo && prNumber
      ? getGitHubRepoCacheKey(
          repo.path,
          repo.id,
          prChecksCacheSuffix(prNumber, pr?.prRepo),
          settings,
          repo.executionHostId,
          true
        )
      : ''
  const commentsCacheKey =
    repo && prNumber
      ? getGitHubRepoCacheKey(
          repo.path,
          repo.id,
          prCommentsCacheSuffix(prNumber, pr?.prRepo),
          settings,
          repo.executionHostId,
          true
        )
      : ''
  const checksFetchedAt = useAppStore((s) =>
    checksCacheKey ? s.checksCache[checksCacheKey]?.fetchedAt : undefined
  )
  const commentsFetchedAt = useAppStore((s) =>
    commentsCacheKey ? s.commentsCache[commentsCacheKey]?.fetchedAt : undefined
  )

  const hostedReviewCreationRequestKey =
    repo && branch
      ? JSON.stringify({
          repoId: repo.id,
          repoPath: repo.path,
          worktreeId: activeWorktreeId ?? null,
          worktreePath: activeWorktreePath,
          runtimeEnvironmentId,
          connectionId: repoConnectionId,
          branch,
          base: repo.worktreeBaseRef ?? null,
          hasUncommittedChanges:
            gitStatusSnapshot?.contextKey === panelContextKey
              ? gitStatusSnapshot.hasUncommittedChanges
              : null,
          hasUpstream:
            gitStatusSnapshot?.contextKey === panelContextKey
              ? (gitStatusSnapshot.remoteStatus?.hasUpstream ?? null)
              : null,
          ahead:
            gitStatusSnapshot?.contextKey === panelContextKey
              ? (gitStatusSnapshot.remoteStatus?.ahead ?? null)
              : null,
          behind:
            gitStatusSnapshot?.contextKey === panelContextKey
              ? (gitStatusSnapshot.remoteStatus?.behind ?? null)
              : null,
          linkedGitHubPR: linkedPR,
          fallbackGitHubPR: fallbackGitHubPRNumber
        })
      : ''
  const gitStatusInputs = readChecksPanelGitStatusSnapshot(gitStatusSnapshot, panelContextKey)
  const gitStatusReadyForPanelContext = gitStatusInputs.hasUncommittedChanges !== undefined
  const hasUncommittedChanges = gitStatusInputs.hasUncommittedChanges
  const remoteStatus = gitStatusInputs.remoteStatus
  // Why: publishing may use the active-worktree fallback while an SSH snapshot
  // lags, but dirty fallback state must still block the action.
  const publishActionGitStatusInputs = readChecksPanelPublishActionGitStatus({
    snapshot: gitStatusSnapshot,
    contextKey: panelContextKey,
    fallbackEntries: gitStatusInvalidation,
    fallbackRemoteStatus: remoteStatusInvalidation
  })
  const publishActionHasUncommittedChanges =
    publishActionGitStatusInputs.hasUncommittedChanges ?? true
  const publishActionRemoteStatus = publishActionGitStatusInputs.remoteStatus
  const hostedReviewCreation =
    hostedReviewCreationSnapshot?.requestKey === hostedReviewCreationRequestKey
      ? hostedReviewCreationSnapshot.data
      : null
  const hostedReviewCreateProvider = resolveHostedReviewCreationProvider(
    hostedReviewCreation?.provider
  )
  const hostedReviewCreateCopy = localizedHostedReviewCopy(hostedReviewCreateProvider)
  const activePullRequestGenerationKey = getPullRequestGenerationRecordKey({
    worktreeId: activeWorktreeId,
    worktreePath: activeWorktreePath,
    repoId: repo?.id,
    branch
  })
  const activePullRequestGenerationRecordCandidate = activePullRequestGenerationKey
    ? (prGenerationRecords[activePullRequestGenerationKey] ?? null)
    : null
  const activePullRequestGenerationRecord =
    activePullRequestGenerationRecordCandidate &&
    activePullRequestGenerationRecordCandidate.context.repoId === repo?.id &&
    activePullRequestGenerationRecordCandidate.context.branch === branch
      ? activePullRequestGenerationRecordCandidate
      : null
  const activePullRequestGenerationSeedRestoreKey = getPullRequestGenerationSeedRestoreKey({
    recordKey: activePullRequestGenerationKey,
    record: activePullRequestGenerationRecord
  })
  const createPrPushFirst = activePullRequestGenerationRecord?.requiresPushBeforeCreate === true
  const handleBranchChangedByPullRequestGeneration = async (
    generationKey: string,
    context: PullRequestGenerationContext
  ): Promise<void> => {
    if (!context.worktreeId || !context.worktreePath) {
      return
    }
    // Why: AI PR detail generation can rebase before summarizing; persist the
    // push requirement because ChecksPanel unmounts when users leave the tab.
    updatePullRequestGenerationRecord(generationKey, (record) =>
      markPullRequestGenerationRequiresPushBeforeCreate({
        record,
        requestId: context.requestId
      })
    )
    try {
      await fetchUpstreamStatus(
        context.worktreeId,
        context.worktreePath,
        context.connectionId,
        undefined,
        {
          runtimeTargetSettings: context.runtimeTargetSettings
        }
      )
    } catch (error) {
      console.warn('[ChecksPanel] post-generation upstream refresh failed', error)
    }
  }

  return {
    ...context,
    prFetchedAt,
    checksCacheKey,
    commentsCacheKey,
    checksFetchedAt,
    commentsFetchedAt,
    hostedReviewCreationRequestKey,
    gitStatusInputs,
    gitStatusReadyForPanelContext,
    hasUncommittedChanges,
    remoteStatus,
    publishActionGitStatusInputs,
    publishActionHasUncommittedChanges,
    publishActionRemoteStatus,
    hostedReviewCreation,
    hostedReviewCreateProvider,
    hostedReviewCreateCopy,
    activePullRequestGenerationKey,
    activePullRequestGenerationRecordCandidate,
    activePullRequestGenerationRecord,
    activePullRequestGenerationSeedRestoreKey,
    createPrPushFirst,
    handleBranchChangedByPullRequestGeneration
  }
}

export type useChecksPanelReviewContextState = ReturnType<typeof useChecksPanelReviewContext>
