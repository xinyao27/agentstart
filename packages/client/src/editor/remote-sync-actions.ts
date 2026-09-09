import type { StateCreator } from 'zustand'
import {
  fastForwardRuntimeGit,
  fetchRuntimeGit,
  getRuntimeGitUpstreamStatus,
  pullRuntimeGit,
  pushRuntimeGit,
  rebaseRuntimeGitFromBase
} from '~renderer/runtime/git-client'
import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'
import { markSyncPushStageError } from '~renderer/source-control/remote-error'
import type { AppState } from '~renderer/store/types'

import {
  resolveSourceControlRemoteOperationFailureOutcome,
  resolveSourceControlSyncAfterPull,
  resolveSourceControlSyncStart,
  type SourceControlRemoteOperationOutcome
} from '../source-control/workflow/operation'
import type { EditorGitSlice } from './git-store'
import { applyRemoteOperationFollowUp } from './source-control-operation-follow-up'
import type { EditorSlice } from './store-contract'

type EditorRemoteSyncActions = Pick<
  EditorGitSlice,
  'pullBranch' | 'fastForwardBranch' | 'syncBranch' | 'rebaseFromBase' | 'fetchBranch'
>

export function createEditorRemoteSyncActions(
  _set: Parameters<StateCreator<AppState, [], [], EditorSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], EditorSlice>>[1]
): EditorRemoteSyncActions {
  return {
    pullBranch: async (worktreeId, worktreePath, connectionId, pushTarget, options) => {
      get().beginRemoteOperation('pull')
      const runtimeSettings = options?.runtimeTargetSettings ?? get().settings
      let outcome: SourceControlRemoteOperationOutcome = 'succeeded'
      try {
        await pullRuntimeGit(
          { settings: runtimeSettings, worktreeId, worktreePath, connectionId },
          pushTarget
        )
      } catch (error) {
        outcome = 'failed'
        publishRendererCommandResult({ type: 'source-control-remote-operation-failed', error })
        throw error
      } finally {
        get().endRemoteOperation()
        applyRemoteOperationFollowUp(get, {
          operation: 'pull',
          outcome,
          worktreeId,
          worktreePath,
          connectionId,
          pushTarget,
          runtimeSettings
        })
      }
    },
    fastForwardBranch: async (worktreeId, worktreePath, connectionId, pushTarget, options) => {
      get().beginRemoteOperation('fast_forward')
      const runtimeSettings = options?.runtimeTargetSettings ?? get().settings
      let outcome: SourceControlRemoteOperationOutcome = 'succeeded'
      try {
        await fastForwardRuntimeGit(
          { settings: runtimeSettings, worktreeId, worktreePath, connectionId },
          pushTarget
        )
      } catch (error) {
        outcome = 'failed'
        publishRendererCommandResult({
          type: 'source-control-remote-operation-failed',
          error,
          context: { isFastForward: true }
        })
        throw error
      } finally {
        get().endRemoteOperation()
        applyRemoteOperationFollowUp(get, {
          operation: 'fast_forward',
          outcome,
          worktreeId,
          worktreePath,
          connectionId,
          pushTarget,
          runtimeSettings
        })
      }
    },
    syncBranch: async (worktreeId, worktreePath, connectionId, pushTarget, options) => {
      // Why: same shape as pushBranch / pullBranch — fire-and-forget the
      // post-op upstream refresh after the busy flag clears so the primary
      // button label rotates immediately when the IPC resolves.
      get().beginRemoteOperation('sync')
      // Why: the inner push stage publishes with { isSync: true } so its failure
      // surfaces a "Sync failed..." message instead of "Push failed..." — the
      // user invoked Sync; the underlying push is implementation detail. The
      // outer catch must skip publishing the same failure twice.
      let pushStageFailurePublished = false
      let pushed = false
      let outcome: SourceControlRemoteOperationOutcome = 'succeeded'
      const runtimeSettings = options?.runtimeTargetSettings ?? get().settings
      try {
        const context = { settings: runtimeSettings, worktreeId, worktreePath, connectionId }
        await fetchRuntimeGit(context, pushTarget)
        const upstreamStatusBeforePull = await getRuntimeGitUpstreamStatus(context, pushTarget)
        if (resolveSourceControlSyncStart(upstreamStatusBeforePull) === 'force_push') {
          try {
            await pushRuntimeGit(context, { pushTarget, forceWithLease: true })
            pushed = true
          } catch (error) {
            publishRendererCommandResult({
              type: 'source-control-remote-operation-failed',
              error,
              context: { isSync: true, isSyncPushStage: true }
            })
            pushStageFailurePublished = true
            throw markSyncPushStageError(error)
          }
        } else {
          await pullRuntimeGit(context, pushTarget)
          // Why: push only if the pull left local commits that aren't on the
          // remote. After a merge pull the ahead count can be >0 (local commits +
          // the new merge commit) or 0 (pure fast-forward), and we avoid a
          // no-op push round-trip in the fast-forward case.
          const upstreamStatus = await getRuntimeGitUpstreamStatus(context, pushTarget)
          if (resolveSourceControlSyncAfterPull(upstreamStatus) === 'push') {
            try {
              await pushRuntimeGit(context, { pushTarget })
              pushed = true
            } catch (error) {
              // Why: format under the user-facing operation (sync) rather than
              // the inner step (push) — the user clicked Sync and shouldn't see
              // a "Push failed" toast for a step they didn't directly invoke.
              publishRendererCommandResult({
                type: 'source-control-remote-operation-failed',
                error,
                context: { isSync: true, isSyncPushStage: true }
              })
              pushStageFailurePublished = true
              throw markSyncPushStageError(error)
            }
          }
        }
      } catch (error) {
        outcome = resolveSourceControlRemoteOperationFailureOutcome({
          operation: 'sync',
          error,
          isPushStage: pushStageFailurePublished
        })
        if (!pushStageFailurePublished) {
          // Why: same isSync framing for fetch/pull/upstream-status failures so
          // every sync failure path consistently reads as "Sync failed..." (or
          // a more specific actionable message like "Pull blocked..." when the
          // shared classifiers match first).
          publishRendererCommandResult({
            type: 'source-control-remote-operation-failed',
            error,
            context: { isSync: true }
          })
        }
        throw error
      } finally {
        get().endRemoteOperation()
        applyRemoteOperationFollowUp(get, {
          operation: 'sync',
          outcome,
          worktreeId,
          worktreePath,
          connectionId,
          pushTarget,
          runtimeSettings,
          syncPushed: pushed
        })
      }
    },
    rebaseFromBase: async (
      worktreeId,
      worktreePath,
      baseRef,
      connectionId,
      pushTarget,
      options
    ) => {
      get().beginRemoteOperation('rebase')
      const runtimeSettings = options?.runtimeTargetSettings ?? get().settings
      let outcome: SourceControlRemoteOperationOutcome = 'succeeded'
      try {
        await rebaseRuntimeGitFromBase(
          { settings: runtimeSettings, worktreeId, worktreePath, connectionId },
          baseRef
        )
      } catch (error) {
        outcome = 'failed'
        publishRendererCommandResult({
          type: 'source-control-remote-operation-failed',
          error,
          context: { isRebase: true }
        })
        throw error
      } finally {
        get().endRemoteOperation()
        applyRemoteOperationFollowUp(get, {
          operation: 'rebase',
          outcome,
          worktreeId,
          worktreePath,
          connectionId,
          pushTarget,
          runtimeSettings
        })
      }
    },
    fetchBranch: async (worktreeId, worktreePath, connectionId, pushTarget, options) => {
      // Why: same shape as pushBranch / pullBranch — fire-and-forget the
      // upstream refresh after the busy flag clears. Fetch updates the
      // remote refs only, so the visible signal we want is the new
      // ahead/behind counts on the upstream-status payload.
      get().beginRemoteOperation('fetch')
      const runtimeSettings = options?.runtimeTargetSettings ?? get().settings
      let outcome: SourceControlRemoteOperationOutcome = 'succeeded'
      try {
        await fetchRuntimeGit(
          { settings: runtimeSettings, worktreeId, worktreePath, connectionId },
          pushTarget
        )
      } catch (error) {
        outcome = 'failed'
        publishRendererCommandResult({
          type: 'source-control-remote-operation-failed',
          error,
          context: { isFetch: true }
        })
        throw error
      } finally {
        get().endRemoteOperation()
        applyRemoteOperationFollowUp(get, {
          operation: 'fetch',
          outcome,
          worktreeId,
          worktreePath,
          connectionId,
          pushTarget,
          runtimeSettings
        })
      }
    }
  }
}
