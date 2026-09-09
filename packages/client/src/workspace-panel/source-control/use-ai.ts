import type {
  SourceControlActionRecipe,
  SourceControlLaunchActionId,
  SourceControlTextActionId
} from '@yiru/protocol/source-control/ai-actions'
import { getCommitMessageModelDiscoveryHostKeyForScope } from '@yiru/protocol/source-control/discovery-host'
import {
  resolveSourceControlActionRecipe,
  resolveSourceControlAiEnabled,
  resolveSourceControlAiPrCreationDefaults,
  type ResolvedSourceControlAiGenerationParams
} from '@yiru/protocol/source-control/resolution'
import { DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS } from '@yiru/protocol/source-control/settings'
import { useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { getRuntimeGitScope } from '~renderer/runtime/git-client'
import type { SourceControlAiWriteTarget } from '~renderer/source-control/ai-recipe-save'
import { resolveSourceControlAiForOperation } from '~renderer/source-control/ai/resolution'
import { useAppStore } from '~renderer/store/state'

import type { SourceControlAiControllerParams } from './ai-controller-types'
import { buildResolveConflictsPrompt } from './ai-prompts'
import {
  saveSourceControlAiActionRecipeForTarget,
  saveSourceControlTextGenerationDefaults
} from './ai-recipe-persistence'
import { openSourceControlAiSettingsTarget } from './ai-settings-navigation'
import { useSourceControlRecoveryAi } from './use-recovery-ai'

export function getSourceControlAiControllerDiscoveryHostKey(
  settings: SourceControlAiControllerParams['settings'],
  activeConnectionId: string | null | undefined
): string {
  return getCommitMessageModelDiscoveryHostKeyForScope(
    getRuntimeGitScope(settings, activeConnectionId)
  )
}

export function useSourceControlAi({
  settings,
  activeRepo,
  activeWorktreeId,
  activeConnectionId,
  activeGroupId,
  activeSourceControlLaunchPlatform,
  conflictOperation,
  unresolvedConflicts,
  stagedEntries,
  worktreePath,
  commitMessage,
  commitError,
  pushRecoveryPrompt,
  updateSettings,
  updateRepo,
  openSettingsTarget,
  openSettingsPage,
  getStoreState = useAppStore.getState
}: SourceControlAiControllerParams) {
  const [resolveConflictsComposerOpen, setResolveConflictsComposerOpen] = useState(false)
  const [commitGenerationDialogOpen, setCommitGenerationDialogOpen] = useState(false)
  const [pullRequestGenerationDialogOpen, setPullRequestGenerationDialogOpen] = useState(false)

  const sourceControlAiDiscoveryHostKey = (() =>
    getSourceControlAiControllerDiscoveryHostKey(settings, activeConnectionId))()
  const sourceControlAiActionsVisible = (() =>
    settings ? resolveSourceControlAiEnabled({ settings, repo: activeRepo }) : false)()
  const resolvedCommitMessageAi = (() =>
    settings
      ? resolveSourceControlAiForOperation({
          settings,
          repo: activeRepo,
          operation: 'commitMessage',
          discoveryHostKey: sourceControlAiDiscoveryHostKey
        })
      : null)()
  const resolvedPrCreationDefaults = (() => {
    if (!settings) {
      return DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS
    }
    const resolved = resolveSourceControlAiForOperation({
      settings,
      repo: activeRepo,
      operation: 'pullRequest',
      discoveryHostKey: sourceControlAiDiscoveryHostKey,
      prCreationProductDefaults: DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS
    })
    return resolved.ok
      ? resolved.value.prCreationDefaults
      : resolveSourceControlAiPrCreationDefaults({
          settings,
          repo: activeRepo,
          prCreationProductDefaults: DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS
        })
  })()

  const getLaunchActionRecipe = (
    actionId: SourceControlLaunchActionId
  ): SourceControlActionRecipe =>
    resolveSourceControlActionRecipe({
      settings,
      repo: activeRepo,
      actionId
    })
  const saveActionRecipeForTarget = async (
    target: SourceControlAiWriteTarget,
    actionId: SourceControlTextActionId | SourceControlLaunchActionId,
    recipe: SourceControlActionRecipe,
    customAgentCommand?: string
  ): Promise<void> => {
    await saveSourceControlAiActionRecipeForTarget({
      getStoreState,
      updateSettings,
      updateRepo,
      target,
      actionId,
      recipe,
      customAgentCommand
    })
  }
  const saveLaunchActionDefault = async (
    target: SourceControlAiWriteTarget,
    actionId: SourceControlLaunchActionId,
    recipe: SourceControlActionRecipe
  ): Promise<void> => {
    await saveActionRecipeForTarget(target, actionId, recipe)
  }

  const openSourceControlAiSettings = (): void => {
    openSourceControlAiSettingsTarget({
      activeRepo,
      openSettingsTarget,
      openSettingsPage
    })
  }

  const resolveConflictsPrompt = (() =>
    buildResolveConflictsPrompt({
      conflictOperation,
      entries: unresolvedConflicts,
      worktreePath
    }))()
  const handleResolveConflictsWithAI = (): void => {
    if (!activeWorktreeId) {
      return
    }
    if (unresolvedConflicts.length === 0) {
      toast.message(
        translate(
          'auto.components.right.sidebar.use.source.control.ai.cfafa92509',
          'No unresolved conflicts to send.'
        )
      )
      return
    }
    setResolveConflictsComposerOpen(true)
  }

  const {
    isLaunchingCommitFailureAgent,
    isLaunchingPushFailureAgent,
    commitFailureRecoveryPrompt,
    pushFailureRecoveryPrompt,
    handleFixCommitFailureWithAI,
    handleFixPushFailureWithAI
  } = useSourceControlRecoveryAi({
    activeWorktreeId,
    activeGroupId,
    activeSourceControlLaunchPlatform,
    // Why: Repo.connectionId is dead — nothing sets it since remote hosts
    // were removed (#63) — getConnectionId already resolves to null for any
    // found repo, so this fallback can never differ.
    sourceRepoConnectionId: undefined,
    worktreePath,
    commitMessage,
    commitError,
    pushRecoveryPrompt,
    stagedEntries,
    getLaunchActionRecipe,
    getStoreState
  })

  const handleSaveCommitMessageGenerationDefaults = async (
    target: SourceControlAiWriteTarget,
    params: ResolvedSourceControlAiGenerationParams
  ): Promise<void> => {
    await saveSourceControlTextGenerationDefaults({
      saveActionRecipeForTarget,
      target,
      actionId: 'commitMessage',
      params
    })
  }

  const handleSavePullRequestGenerationDefaults = async (
    target: SourceControlAiWriteTarget,
    params: ResolvedSourceControlAiGenerationParams
  ): Promise<void> => {
    await saveSourceControlTextGenerationDefaults({
      saveActionRecipeForTarget,
      target,
      actionId: 'pullRequest',
      params
    })
  }

  const openCommitGenerationDialog = (): void => {
    setCommitGenerationDialogOpen(true)
  }
  const openPullRequestGenerationDialog = (): void => {
    setPullRequestGenerationDialogOpen(true)
  }

  return {
    sourceControlAiDiscoveryHostKey,
    sourceControlAiActionsVisible,
    resolvedCommitMessageAi,
    resolvedPrCreationDefaults,
    resolveConflictsComposerOpen,
    setResolveConflictsComposerOpen,
    commitGenerationDialogOpen,
    setCommitGenerationDialogOpen,
    pullRequestGenerationDialogOpen,
    setPullRequestGenerationDialogOpen,
    openCommitGenerationDialog,
    openPullRequestGenerationDialog,
    isLaunchingCommitFailureAgent,
    isLaunchingPushFailureAgent,
    resolveConflictsPrompt,
    commitFailureRecoveryPrompt,
    pushFailureRecoveryPrompt,
    getLaunchActionRecipe,
    saveLaunchActionDefault,
    handleResolveConflictsWithAI,
    handleFixCommitFailureWithAI,
    handleFixPushFailureWithAI,
    handleSaveCommitMessageGenerationDefaults,
    handleSavePullRequestGenerationDefaults,
    openSourceControlAiSettings
  }
}
