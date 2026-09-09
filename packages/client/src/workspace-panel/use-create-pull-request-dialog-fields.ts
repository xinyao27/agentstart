import { DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS } from '@yiru/protocol/source-control/settings'
import { resolveSourceControlAiForOperation } from '~renderer/source-control/ai/resolution'

import {
  normalizeCreateReviewBaseSearchResults,
  resolveCreateReviewDefaultBaseRef,
  stripBaseRef
} from './create-review-base-ref'
import { useCreateReviewBaseSearch } from './create-review-base-search'
import { useCreateReviewDialogFieldState } from './create-review-dialog-field-state'
import type { UseCreatePullRequestDialogFieldsOptions } from './create-review-dialog-field-types'
import { useCreateReviewFieldGeneration } from './create-review-field-generation'

export { normalizeCreateReviewBaseSearchResults, stripBaseRef }

export function useCreatePullRequestDialogFields(options: UseCreatePullRequestDialogFieldsOptions) {
  const {
    currentBaseRef,
    eligibility,
    prCreationDefaults,
    repo,
    settings,
    sourceControlAiActionsVisible = true
  } = options
  const resolvedPullRequestAi = settings
    ? resolveSourceControlAiForOperation({ settings, repo, operation: 'pullRequest' })
    : null
  const resolvedPrDefaults = {
    ...DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS,
    ...prCreationDefaults
  }
  const resolvedDefaultBaseRef = resolveCreateReviewDefaultBaseRef({
    currentBaseRef,
    eligibilityDefaultBaseRef: eligibility?.defaultBaseRef
  })
  const state = useCreateReviewDialogFieldState({
    options,
    resolvedDefaultBaseRef,
    resolvedPrDefaults
  })
  useCreateReviewBaseSearch(options, state)
  const generation = useCreateReviewFieldGeneration({
    options,
    resolvedPullRequestAi,
    resolvedPrDefaults,
    state
  })

  return {
    aiGenerationEnabled: sourceControlAiActionsVisible && resolvedPullRequestAi?.ok === true,
    initializedFromEligibility:
      state.currentEligibilityKey !== null &&
      state.initializedEligibilityKey === state.currentEligibilityKey,
    base: state.base,
    setBase: state.setUserBase,
    title: state.title,
    setTitle: state.setTitle,
    body: state.body,
    setBody: state.setBody,
    draft: state.draft,
    setDraft: state.setDraft,
    fieldRevisions: state.fieldRevisionsRef.current,
    applyGeneratedFields: state.applyGeneratedFields,
    baseQuery: state.baseQuery,
    setBaseQuery: state.setBaseQuery,
    baseResults: state.baseResults,
    setBaseResults: state.setBaseResults,
    baseSearchError: state.baseSearchError,
    generating: generation.effectiveGenerating,
    generateError: generation.effectiveGenerateError,
    generateDisabled: generation.generateDisabled,
    generateDisabledReason: generation.generateDisabledReason,
    handleGenerate: generation.handleGenerate,
    handleCancelGenerate: generation.handleCancelGenerate
  }
}
