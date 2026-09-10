import { getCommitMessageModelDiscoveryHostKeyForScope } from '@agentstart/protocol/source-control/discovery-host'
import {
  resolveSourceControlAiEnabled,
  resolveSourceControlAiPrCreationDefaults
} from '@agentstart/protocol/source-control/resolution'
import { DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS } from '@agentstart/protocol/source-control/settings'
import { getRuntimeGitScope } from '~renderer/runtime/git-client'
import { resolveSourceControlAiForOperation } from '~renderer/source-control/ai/resolution'

import type { useChecksPanelReviewContextState } from './review-context'

export function useChecksPanelGenerationDefaults(context: useChecksPanelReviewContextState) {
  const { activeReview, branch, hostedReviewCreation, isFolder, repo, settings } = context

  const prCreationDefaults = (() => {
    if (!settings) {
      return DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS
    }
    // Why: Repo.connectionId is dead — nothing sets it since remote hosts
    // were removed (#63) — a checks-panel repo is never remote.
    const hostKey = getCommitMessageModelDiscoveryHostKeyForScope(
      getRuntimeGitScope(settings, null)
    )
    const resolved = resolveSourceControlAiForOperation({
      settings,
      repo,
      operation: 'pullRequest',
      discoveryHostKey: hostKey,
      prCreationProductDefaults: DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS
    })
    return resolved.ok
      ? resolved.value.prCreationDefaults
      : resolveSourceControlAiPrCreationDefaults({
          settings,
          repo,
          prCreationProductDefaults: DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS
        })
  })()
  const sourceControlAiActionsVisible = (() =>
    settings ? resolveSourceControlAiEnabled({ settings, repo }) : false)()
  const createComposerOpen =
    !activeReview &&
    !isFolder &&
    Boolean(branch) &&
    (hostedReviewCreation?.canCreate === true ||
      hostedReviewCreation?.blockedReason === 'needs_push')

  return { ...context, prCreationDefaults, sourceControlAiActionsVisible, createComposerOpen }
}

export type useChecksPanelGenerationDefaultsState = ReturnType<
  typeof useChecksPanelGenerationDefaults
>
