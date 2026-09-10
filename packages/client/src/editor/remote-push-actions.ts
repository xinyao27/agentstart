import type { StateCreator } from 'zustand'
import { getRuntimeGitUpstreamStatus, pushRuntimeGit } from '~renderer/runtime/git-client'
import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'
import type { AppState } from '~renderer/store/types'
import { invalidateAutomaticPushTargetUpstreamStatusCache } from '~renderer/workspace-panel/push-target-upstream-refresh-cache'

import {
  resolveSourceControlRemoteOperationFailureOutcome,
  type SourceControlRemoteOperationOutcome
} from '../source-control/workflow/operation'
import type { EditorGitSlice } from './git-store'
import { applyRemoteOperationFollowUp } from './source-control-operation-follow-up'
import type { EditorSlice } from './store-contract'

type EditorRemotePushActions = Pick<
  EditorGitSlice,
  | 'isRemoteOperationActive'
  | 'remoteOperationDepth'
  | 'inFlightRemoteOpKind'
  | 'beginRemoteOperation'
  | 'endRemoteOperation'
  | 'fetchUpstreamStatus'
  | 'pushBranch'
>

export function createEditorRemotePushActions(
  set: Parameters<StateCreator<AppState, [], [], EditorSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], EditorSlice>>[1]
): EditorRemotePushActions {
  return {
    isRemoteOperationActive: false,
    remoteOperationDepth: 0,
    inFlightRemoteOpKind: null,
    beginRemoteOperation: (kind) =>
      set((s) => ({
        remoteOperationDepth: s.remoteOperationDepth + 1,
        isRemoteOperationActive: true,
        // Why: last-write-wins. The UI disables every action entry while busy,
        // so a second remote op can't be started from inside AgentStart. If a
        // background caller (future) triggers one, surfacing the most recent
        // kind matches "what the user is currently watching".
        inFlightRemoteOpKind: kind ?? s.inFlightRemoteOpKind
      })),
    endRemoteOperation: () =>
      set((s) => {
        const next = Math.max(0, s.remoteOperationDepth - 1)
        return {
          remoteOperationDepth: next,
          isRemoteOperationActive: next > 0,
          // Why: only clear the in-flight kind when no remote op remains. Until
          // depth reaches 0 some other op is still running and its label/
          // spinner should keep displaying.
          inFlightRemoteOpKind: next > 0 ? s.inFlightRemoteOpKind : null
        }
      }),
    fetchUpstreamStatus: async (worktreeId, worktreePath, connectionId, pushTarget, options) => {
      const runtimeSettings = options?.runtimeTargetSettings ?? get().settings
      try {
        const status = await getRuntimeGitUpstreamStatus(
          {
            settings: runtimeSettings,
            worktreeId,
            worktreePath,
            connectionId
          },
          pushTarget
        )
        if (options?.applyUpstreamStatus !== false) {
          get().setUpstreamStatus(worktreeId, status)
        }
        return status
      } catch (error) {
        // Why: on error we leave the prior status in place rather than writing a
        // synthetic {hasUpstream:false} — that would flash 'Publish Branch' on a
        // tracked branch after any transient IPC hiccup and a user click would
        // re-publish, clobbering the upstream relationship. If the branch is
        // genuinely newly unpublished, the polling effect will eventually correct
        // the status on success.
        if (pushTarget) {
          // Why: an old automatic poll cache entry must not suppress the next
          // retry after a post-push/fetch refresh fails transiently.
          invalidateAutomaticPushTargetUpstreamStatusCache({
            settings: runtimeSettings,
            worktreeId,
            worktreePath,
            connectionId,
            pushTarget
          })
        }
        console.error('fetchUpstreamStatus failed', error)
        return null
      }
    },
    pushBranch: async (
      worktreeId,
      worktreePath,
      publish = false,
      connectionId,
      pushTarget,
      options = {}
    ) => {
      // Why: don't *await* a post-op git status / upstream refresh here.
      // Chaining awaited refreshes inside the mutation extends the gap before
      // compound flows (runCompoundCommitAction → runRemoteAction) reach the
      // next step. But we still need a near-immediate upstream refresh so
      // the primary button label rotates from "Push" to "Commit" as soon as
      // ahead=0 — the polling layer is on a 3s interval, which is long
      // enough to read as a stuck label. Solution: fire the upstream refresh
      // as fire-and-forget so it doesn't block the mutation but updates the
      // store as soon as the IPC resolves.
      get().beginRemoteOperation(
        publish ? 'publish' : options.forceWithLease === true ? 'force_push' : 'push'
      )
      let outcome: SourceControlRemoteOperationOutcome = 'succeeded'
      const runtimeSettings = options.runtimeTargetSettings ?? get().settings
      try {
        await pushRuntimeGit(
          { settings: runtimeSettings, worktreeId, worktreePath, connectionId },
          { publish, pushTarget, forceWithLease: options.forceWithLease }
        )
      } catch (error) {
        outcome = resolveSourceControlRemoteOperationFailureOutcome({
          operation: publish ? 'publish' : options.forceWithLease === true ? 'force_push' : 'push',
          error
        })
        publishRendererCommandResult({
          type: 'source-control-remote-operation-failed',
          error,
          context: {
            publish,
            isPush: !publish && options.forceWithLease !== true,
            isForcePush: !publish && options.forceWithLease === true
          }
        })
        throw error
      } finally {
        get().endRemoteOperation()
        applyRemoteOperationFollowUp(get, {
          operation: publish ? 'publish' : options.forceWithLease === true ? 'force_push' : 'push',
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
