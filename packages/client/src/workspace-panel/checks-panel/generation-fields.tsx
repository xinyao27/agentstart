import { useEffect } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'

import { shouldHydratePullRequestGenerationResult } from '../pull-request-generation-state'
import { useCreatePullRequestDialogFields } from '../use-create-pull-request-dialog-fields'
import { checksPanelAsyncResultKey, shouldCommitChecksPanelAsyncResult } from './async-result-key'
import type { useChecksPanelGenerationActionsState } from './generation-actions'

export function useChecksPanelGenerationFields(context: useChecksPanelGenerationActionsState) {
  const {
    activePullRequestGenerationKey,
    activePullRequestGenerationRecord,
    activePullRequestGenerationSeedRestoreKey,
    activeWorktreeId,
    activeWorktreePath,
    branch,
    createComposerOpen,
    handleCancelGeneratePullRequestFieldsForActive,
    handleGeneratePullRequestFieldsForActive,
    handlePullRequestGenerationSeedRestored,
    hostedReviewCreation,
    isCreatingPr,
    ownerSettings,
    pr,
    prCacheKey,
    prCreationDefaults,
    prNumber,
    repo,
    setCreatePrError,
    sourceControlAiActionsVisible,
    updatePullRequestGenerationRecord
  } = context

  const {
    aiGenerationEnabled: prAiGenerationEnabled,
    base: prBase,
    setBase: setPrBase,
    title: prTitle,
    setTitle: setPrTitle,
    body: prBody,
    setBody: setPrBody,
    draft: prDraft,
    setDraft: setPrDraft,
    baseQuery: prBaseQuery,
    setBaseQuery: setPrBaseQuery,
    baseResults: prBaseResults,
    setBaseResults: setPrBaseResults,
    baseSearchError: prBaseSearchError,
    generating: prGenerating,
    generateError: prGenerateError,
    generateDisabled: prGenerateDisabled,
    generateDisabledReason: prGenerateDisabledReason,
    handleGenerate: handleGeneratePullRequestFields,
    handleCancelGenerate: handleCancelGeneratePullRequestFields,
    applyGeneratedFields: applyGeneratedPullRequestFields,
    initializedFromEligibility: pullRequestFieldsInitialized
  } = useCreatePullRequestDialogFields({
    open: createComposerOpen,
    repoId: repo?.id ?? '',
    worktreeId: activeWorktreeId,
    worktreePath: activeWorktreePath ?? '',
    branch,
    eligibility: hostedReviewCreation,
    repo,
    settings: ownerSettings,
    submitting: isCreatingPr,
    prCreationDefaults,
    sourceControlAiActionsVisible,
    generation: {
      generating: activePullRequestGenerationRecord?.status === 'running',
      generateError: activePullRequestGenerationRecord?.error ?? null,
      seedRestoreKey: activePullRequestGenerationSeedRestoreKey,
      seed: activePullRequestGenerationRecord?.seed ?? null,
      seedFieldRevisions: activePullRequestGenerationRecord?.seedFieldRevisions ?? null,
      onSeedRestored: handlePullRequestGenerationSeedRestored,
      onGenerate: (fields, fieldRevisions, overrides) => {
        void handleGeneratePullRequestFieldsForActive(fields, fieldRevisions, overrides)
      },
      onCancelGenerate: handleCancelGeneratePullRequestFieldsForActive
    }
  })
  useEffect(() => {
    // Why: checks-panel PR generation can finish while this composer is hidden
    // by a worktree switch; hydrate once the original composer is visible again.
    if (
      !activePullRequestGenerationKey ||
      !activePullRequestGenerationRecord ||
      activePullRequestGenerationRecord.status !== 'succeeded' ||
      !activePullRequestGenerationRecord.result ||
      activePullRequestGenerationRecord.hydrated ||
      !pullRequestFieldsInitialized
    ) {
      return
    }
    if (
      !shouldHydratePullRequestGenerationResult({
        record: activePullRequestGenerationRecord
      })
    ) {
      return
    }
    applyGeneratedPullRequestFields(
      activePullRequestGenerationRecord.result,
      activePullRequestGenerationRecord.seedFieldRevisions
    )
    updatePullRequestGenerationRecord(activePullRequestGenerationKey, (record) => {
      if (
        !record ||
        record.context.requestId !== activePullRequestGenerationRecord.context.requestId
      ) {
        return null
      }
      return {
        ...record,
        hydrated: true
      }
    })
  }, [
    activePullRequestGenerationKey,
    activePullRequestGenerationRecord,
    applyGeneratedPullRequestFields,
    pullRequestFieldsInitialized,
    updatePullRequestGenerationRecord
  ])
  const handlePrBaseChange = (value: string): void => {
    setCreatePrError(null)
    setPrBase(value)
  }
  const handlePrTitleChange = (value: string): void => {
    setCreatePrError(null)
    setPrTitle(value)
  }
  const stateRequestKey =
    repo && branch
      ? checksPanelAsyncResultKey(prCacheKey, branch, prNumber, pr?.prRepo, pr?.headSha)
      : ''
  const isCurrentAsyncResult = useEventCallback((requestKey: string) =>
    shouldCommitChecksPanelAsyncResult(stateRequestKey, requestKey)
  )

  return {
    ...context,
    prAiGenerationEnabled,
    prBase,
    setPrBase,
    prTitle,
    setPrTitle,
    prBody,
    setPrBody,
    prDraft,
    setPrDraft,
    prBaseQuery,
    setPrBaseQuery,
    prBaseResults,
    setPrBaseResults,
    prBaseSearchError,
    prGenerating,
    prGenerateError,
    prGenerateDisabled,
    prGenerateDisabledReason,
    handleGeneratePullRequestFields,
    handleCancelGeneratePullRequestFields,
    applyGeneratedPullRequestFields,
    pullRequestFieldsInitialized,
    handlePrBaseChange,
    handlePrTitleChange,
    stateRequestKey,
    isCurrentAsyncResult
  }
}

export type useChecksPanelGenerationFieldsState = ReturnType<typeof useChecksPanelGenerationFields>
