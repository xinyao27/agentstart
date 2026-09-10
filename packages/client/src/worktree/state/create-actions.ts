import { folderWorkspaceKey, parseWorkspaceKey } from '@agentstart/protocol/workspace/identity'
import type { StateCreator } from 'zustand'
import { readWorktreeMutationRevision } from '~renderer/project-catalog/catalog-snapshot'
import { refreshAfterWorktreeMutation } from '~renderer/project-catalog/mutation-refresh'
import { readProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import {
  createRuntimeWorktree,
  prefetchRuntimeWorktreeCreateBase
} from '~renderer/runtime/worktree-lifecycle-target'

import type { AppState } from '../../store/types'
import {
  CLIENT_WORKTREE_CREATE_MAX_ATTEMPTS,
  getClientWorktreeCreateCandidate,
  isRetryableWorktreeCreateConflict
} from '../create-retry-policy'
import { publishLocalBaseRefRefreshResult } from './refresh-model'
import { settingsForRepoOwner } from './runtime-owner'
import type { WorktreeSlice } from './types'

export function createWorktreeCreateActions(
  set: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[1]
): Pick<WorktreeSlice, 'prefetchWorktreeCreateBase' | 'createWorktree'> {
  return {
    prefetchWorktreeCreateBase: async (repoId, baseBranch) => {
      try {
        const target = getActiveRuntimeTarget(
          settingsForRepoOwner(readProjectCatalogRuntimeState(), repoId)
        )
        await prefetchRuntimeWorktreeCreateBase(target, {
          repo: repoId,
          ...(baseBranch ? { baseBranch } : {})
        })
      } catch {
        // Why: prefetch is only a latency hedge. The create path awaits the same
        // backend refresh and owns user-visible error reporting.
      }
    },
    createWorktree: async (
      repoId,
      name,
      baseBranch,
      setupDecision = 'inherit',
      sparseCheckout,
      telemetrySource,
      displayName,
      linkedPR,
      pushTarget,
      createdWithAgent,
      branchNameOverride,
      workspaceStatus,
      startup,
      pendingFirstAgentMessageRename,
      creationId,
      compareBaseRef
    ) => {
      try {
        for (let attempt = 0; attempt < CLIENT_WORKTREE_CREATE_MAX_ATTEMPTS; attempt += 1) {
          const candidateName = getClientWorktreeCreateCandidate(name, attempt)
          // Why: older runtimes may still reject exact PR branch overrides on
          // collision, so the renderer retries both branch and worktree names.
          const candidateBranchNameOverride = branchNameOverride
            ? getClientWorktreeCreateCandidate(branchNameOverride, attempt)
            : undefined
          try {
            // Why: Manual sort is user-authored order. Stamp new workspaces
            // deliberately at the top instead of relying on sortOrder fallback.
            const manualOrder = get().sortBy === 'manual' ? Date.now() : undefined
            const activeScope = parseWorkspaceKey(get().activeWorkspaceKey ?? '')
            const parentWorkspace =
              activeScope?.type === 'folder'
                ? folderWorkspaceKey(activeScope.folderWorkspaceId)
                : undefined
            const target = getActiveRuntimeTarget(
              settingsForRepoOwner(readProjectCatalogRuntimeState(), repoId)
            )
            const expectedRevision = readWorktreeMutationRevision(target, repoId)
            const createArgs = {
              expectedRevision,
              repoId,
              name: candidateName,
              baseBranch,
              ...(compareBaseRef ? { compareBaseRef } : {}),
              ...(candidateBranchNameOverride
                ? { branchNameOverride: candidateBranchNameOverride }
                : {}),
              setupDecision,
              sparseCheckout,
              ...(displayName ? { displayName } : {}),
              ...(telemetrySource ? { telemetrySource } : {}),
              ...(linkedPR !== undefined ? { linkedPR } : {}),
              ...(pushTarget ? { pushTarget } : {}),
              ...(createdWithAgent ? { createdWithAgent } : {}),
              ...(pendingFirstAgentMessageRename === true && createdWithAgent
                ? { pendingFirstAgentMessageRename: true }
                : {}),
              ...(manualOrder !== undefined ? { manualOrder } : {}),
              ...(parentWorkspace ? { parentWorkspace } : {}),
              ...(workspaceStatus !== undefined ? { workspaceStatus } : {}),
              ...(startup ? { startup } : {}),
              ...(creationId ? { creationId } : {})
            }
            const result =
              target.kind === 'local'
                ? await workspaceHostClient.worktrees.create(createArgs)
                : await createRuntimeWorktree(target, {
                    expectedRevision,
                    repo: repoId,
                    operationId: creationId,
                    name: candidateName,
                    baseBranch,
                    ...(compareBaseRef ? { compareBaseRef } : {}),
                    ...(candidateBranchNameOverride
                      ? { branchNameOverride: candidateBranchNameOverride }
                      : {}),
                    setupDecision,
                    sparseCheckout,
                    ...(displayName ? { displayName } : {}),
                    ...(telemetrySource ? { telemetrySource } : {}),
                    ...(linkedPR !== undefined ? { linkedPR } : {}),
                    ...(pushTarget ? { pushTarget } : {}),
                    ...(createdWithAgent ? { createdWithAgent } : {}),
                    ...(pendingFirstAgentMessageRename === true && createdWithAgent
                      ? { pendingFirstAgentMessageRename: true }
                      : {}),
                    ...(manualOrder !== undefined ? { manualOrder } : {}),
                    ...(parentWorkspace ? { parentWorkspace } : {}),
                    ...(workspaceStatus !== undefined ? { workspaceStatus } : {}),
                    ...(startup
                      ? {
                          startupCommand: startup.command,
                          ...(startup.env ? { startupEnv: startup.env } : {}),
                          ...(startup.launchConfig
                            ? { startupLaunchConfig: startup.launchConfig }
                            : {}),
                          ...(startup.startupCommandDelivery
                            ? { startupCommandDelivery: startup.startupCommandDelivery }
                            : {}),
                          activate: true
                        }
                      : {})
                  })
            await refreshAfterWorktreeMutation(target, repoId, result.revision)
            set((s) => {
              return {
                ...(result.initialBaseStatus
                  ? {
                      baseStatusByWorktreeId: {
                        ...s.baseStatusByWorktreeId,
                        [result.worktree.id]:
                          s.baseStatusByWorktreeId[result.worktree.id] ?? result.initialBaseStatus
                      }
                    }
                  : {}),
                sortEpoch: s.sortEpoch + 1
              }
            })
            publishLocalBaseRefRefreshResult(result.localBaseRefRefresh)
            if (result.localBaseRefUpdateSuggestion) {
              publishRendererCommandResult({
                type: 'worktree-local-base-ref-suggestion',
                suggestion: result.localBaseRefUpdateSuggestion
              })
            }
            return result
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            const shouldRetry = isRetryableWorktreeCreateConflict(message)
            if (!shouldRetry || attempt === CLIENT_WORKTREE_CREATE_MAX_ATTEMPTS - 1) {
              throw error
            }
          }
        }

        throw new Error('Failed to create worktree after retrying branch conflicts.')
      } catch (err) {
        console.error('Failed to create worktree:', err)
        throw err
      }
    }
  }
}
