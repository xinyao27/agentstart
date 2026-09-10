import { isCustomAgentId } from '@agentstart/protocol/source-control/custom-agent'
import { getConnectionId } from '~renderer/runtime/connection-context'
import {
  generateRuntimeCommitMessage,
  type RuntimeGenerateCommitMessageOverrides
} from '~renderer/runtime/git-client'
import { useAppStore } from '~renderer/store/state'
import {
  createRunningCommitMessageGenerationRecord,
  resolveCommitMessageGenerationFailure,
  resolveCommitMessageGenerationSuccess
} from '~renderer/workspace-panel/commit-message-generation-state'

import type { CreatePrIntentRunToken } from '../create-pr-intent-flow'
import { writeCommitDraftForWorktree } from '../panel-state'
import { hasConfiguredCommitMessageGenerationDefaults } from '../text-generation-defaults'
import type { SourceControlCommitActionController } from './commit-action'

export function useSourceControlCommitGeneration(scope: SourceControlCommitActionController) {
  const {
    activeCommitMessageGenerationKey,
    activeRepo,
    activeRepoSettings,
    activeWorktreeId,
    allocateCommitMessageGenerationRequestId,
    generateInFlightRef,
    getCreatePrIntentOperationTarget,
    openCommitGenerationDialog,
    resolvedCommitMessageAi,
    setCommitMessageGenerationRecord,
    setGenerateErrors,
    setGenerateInFlightByWorktree,
    settings,
    sourceControlAiActionsVisible,
    updateCommitDrafts,
    updateCommitMessageGenerationRecord,
    worktreePath
  } = scope
  const handleGenerate = async (
    overrides?: RuntimeGenerateCommitMessageOverrides
  ): Promise<void> => {
    if (!activeWorktreeId || !worktreePath || !activeCommitMessageGenerationKey) {
      return
    }
    if (generateInFlightRef.current[activeWorktreeId]) {
      return
    }
    if (!overrides?.sourceControlAiResolvedParams && resolvedCommitMessageAi?.ok !== true) {
      return
    }

    if (
      !overrides?.sourceControlAiResolvedParams &&
      resolvedCommitMessageAi?.ok === true &&
      isCustomAgentId(resolvedCommitMessageAi.value.params.agentId)
    ) {
      const command = resolvedCommitMessageAi.value.params.customAgentCommand?.trim() ?? ''
      if (!command) {
        setGenerateErrors((prev) => ({
          ...prev,
          [activeWorktreeId]:
            'Custom command is empty. Add one in Settings -> Git -> Source Control AI.'
        }))
        return
      }
    }

    generateInFlightRef.current[activeWorktreeId] = true
    const requestId = allocateCommitMessageGenerationRequestId()
    const connectionId = getConnectionId(activeWorktreeId) ?? undefined
    setCommitMessageGenerationRecord(
      activeCommitMessageGenerationKey,
      createRunningCommitMessageGenerationRecord({
        worktreeId: activeWorktreeId,
        worktreePath,
        connectionId,
        requestId,
        runtimeTargetSettings: activeRepoSettings
      })
    )
    setGenerateInFlightByWorktree((prev) => ({ ...prev, [activeWorktreeId]: true }))
    setGenerateErrors((prev) => ({ ...prev, [activeWorktreeId]: null }))
    try {
      const result = await generateRuntimeCommitMessage(
        {
          // Why: route generation by the repo OWNER host, not the focused runtime.
          settings: activeRepoSettings,
          worktreeId: activeWorktreeId,
          worktreePath,
          connectionId
        },
        overrides
      )

      if (!result.success) {
        // Why: cancellation is a deliberate user action, not a failure to
        // surface. Clear any prior error and stay quiet.
        if (result.canceled) {
          setGenerateErrors((prev) => ({ ...prev, [activeWorktreeId]: null }))
          updateCommitMessageGenerationRecord(activeCommitMessageGenerationKey, (record) =>
            resolveCommitMessageGenerationFailure({
              record,
              requestId,
              canceled: true,
              error: null
            })
          )
          return
        }
        setGenerateErrors((prev) => ({
          ...prev,
          [activeWorktreeId]: result.error
        }))
        updateCommitMessageGenerationRecord(activeCommitMessageGenerationKey, (record) =>
          resolveCommitMessageGenerationFailure({
            record,
            requestId,
            error: result.error
          })
        )
        return
      }

      updateCommitMessageGenerationRecord(activeCommitMessageGenerationKey, (record) =>
        resolveCommitMessageGenerationSuccess({
          record,
          requestId,
          message: result.message
        })
      )
      // Why: never overwrite a commit draft the user began editing while AI
      // generation was in flight.
      updateCommitDrafts((prev) => {
        const current = prev[activeWorktreeId]
        if (current && current.length > 0) {
          return prev
        }
        return writeCommitDraftForWorktree(prev, activeWorktreeId, result.message)
      })
      useAppStore.getState().recordFeatureInteraction('ai-commit-generation')
      setGenerateErrors((prev) => ({ ...prev, [activeWorktreeId]: null }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate commit message'
      setGenerateErrors((prev) => ({
        ...prev,
        [activeWorktreeId]: message
      }))
      updateCommitMessageGenerationRecord(activeCommitMessageGenerationKey, (record) =>
        resolveCommitMessageGenerationFailure({
          record,
          requestId,
          error: message
        })
      )
    } finally {
      setGenerateInFlightByWorktree((prev) => ({ ...prev, [activeWorktreeId]: false }))
      generateInFlightRef.current[activeWorktreeId] = false
    }
  }
  const handleGenerateCommitMessageClick = (): void => {
    if (!sourceControlAiActionsVisible) {
      return
    }
    if (
      hasConfiguredCommitMessageGenerationDefaults({ settings, repo: activeRepo ?? null }) &&
      resolvedCommitMessageAi?.ok
    ) {
      void handleGenerate({ sourceControlAiResolvedParams: resolvedCommitMessageAi.value.params })
      return
    }
    openCommitGenerationDialog()
  }
  const generateCommitMessageForCreatePrIntent = async (
    token: CreatePrIntentRunToken
  ): Promise<{
    ok: boolean
    message?: string
    reason?: 'settings' | 'failed' | 'canceled'
  }> => {
    if (
      !hasConfiguredCommitMessageGenerationDefaults({ settings, repo: activeRepo ?? null }) ||
      resolvedCommitMessageAi?.ok !== true
    ) {
      return { ok: false, reason: 'settings' }
    }
    if (isCustomAgentId(resolvedCommitMessageAi.value.params.agentId)) {
      const command = resolvedCommitMessageAi.value.params.customAgentCommand?.trim() ?? ''
      if (!command) {
        return { ok: false, reason: 'settings' }
      }
    }
    const target = getCreatePrIntentOperationTarget(token)
    if (generateInFlightRef.current[target.worktreeId]) {
      return { ok: false, reason: 'failed' }
    }

    generateInFlightRef.current[target.worktreeId] = true
    setGenerateInFlightByWorktree((prev) => ({ ...prev, [target.worktreeId]: true }))
    setGenerateErrors((prev) => ({ ...prev, [target.worktreeId]: null }))
    try {
      const result = await generateRuntimeCommitMessage(target, {
        sourceControlAiResolvedParams: resolvedCommitMessageAi.value.params
      })
      if (!result.success) {
        if (!result.canceled) {
          setGenerateErrors((prev) => ({ ...prev, [target.worktreeId]: result.error }))
        }
        return { ok: false, reason: result.canceled ? 'canceled' : 'failed' }
      }
      useAppStore.getState().recordFeatureInteraction('ai-commit-generation')
      setGenerateErrors((prev) => ({ ...prev, [target.worktreeId]: null }))
      return { ok: true, message: result.message }
    } catch (error) {
      setGenerateErrors((prev) => ({
        ...prev,
        [target.worktreeId]:
          error instanceof Error ? error.message : 'Failed to generate commit message'
      }))
      return { ok: false, reason: 'failed' }
    } finally {
      setGenerateInFlightByWorktree((prev) => ({ ...prev, [target.worktreeId]: false }))
      generateInFlightRef.current[target.worktreeId] = false
    }
  }
  return {
    ...scope,
    handleGenerate,
    handleGenerateCommitMessageClick,
    generateCommitMessageForCreatePrIntent
  }
}

export type SourceControlCommitGenerationController = ReturnType<
  typeof useSourceControlCommitGeneration
>
