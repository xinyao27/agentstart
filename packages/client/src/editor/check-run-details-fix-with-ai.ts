import type {
  PRCheckDetail,
  PRCheckRunDetails
} from '@agentstart/protocol/hosted-review/review-types'
import type {
  SourceControlActionRecipe,
  SourceControlLaunchActionId
} from '@agentstart/protocol/source-control/ai-actions'
import { resolveSourceControlActionRecipe } from '@agentstart/protocol/source-control/resolution'
import { useState } from 'react'
import { toast } from 'sonner'
import { startFixChecksAgent } from '~renderer/editor/fix-checks-agent-launch'
import { translate } from '~renderer/i18n/i18n'
import { useProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import { getConnectionId } from '~renderer/runtime/connection-context'
import { resolveSourceControlLaunchPlatform } from '~renderer/source-control/agent-platform'
import { readSourceControlLaunchRecipeAgentId } from '~renderer/source-control/agent-selection'
import {
  saveSourceControlActionRecipe,
  type SourceControlAiWriteTarget
} from '~renderer/source-control/ai-recipe-save'
import { useAppStore } from '~renderer/store/state'
import { findWorktreeById } from '~renderer/worktree/state/types'

import { openSourceControlAiSettingsTarget } from '../workspace-panel/source-control/ai-settings-navigation'
import {
  buildCheckRunDetailsFixBasePrompt,
  getCheckRunDetailsFixDisabledReason,
  isCheckRunDetailsFixCandidate,
  resolveCheckRunDetailsFixCheck,
  resolveHostedReviewForCheckRunDetailsFix,
  resolveCheckRunDetailsFixRepo
} from './check-run-details-fix-context'

async function startCheckRunDetailsFixWithAI(args: {
  worktreeId: string
  check: PRCheckDetail
  details: PRCheckRunDetails | null
}): Promise<boolean> {
  const disabledReason = getCheckRunDetailsFixDisabledReason(args.worktreeId)
  if (disabledReason) {
    toast.message(disabledReason)
    return false
  }
  const resolvedCheck = resolveCheckRunDetailsFixCheck(args.check, args.details)
  if (!isCheckRunDetailsFixCandidate(resolvedCheck)) {
    toast.message(
      translate(
        'auto.components.editor.check.run.details.fix.with.ai.9b2f6d4a81',
        'This check is not failing.'
      )
    )
    return false
  }
  const review = resolveHostedReviewForCheckRunDetailsFix(args.worktreeId)
  if (!review) {
    toast.message(
      translate(
        'auto.components.editor.check.run.details.fix.with.ai.7c3e1b5d42',
        'Open a PR before launching an AI fix.'
      )
    )
    return false
  }
  const repoId = resolveCheckRunDetailsFixRepo(args.worktreeId)?.id
  if (!repoId) {
    return false
  }
  const basePrompt =
    buildCheckRunDetailsFixBasePrompt({
      worktreeId: args.worktreeId,
      check: args.check,
      details: args.details
    }) ?? ''
  if (!basePrompt) {
    return false
  }
  const started = await startFixChecksAgent({
    repoId,
    basePrompt,
    worktreeId: args.worktreeId,
    groupId: args.worktreeId,
    launchSource: 'task_page'
  })
  if (started) {
    toast.success(
      translate(
        'auto.components.editor.check.run.details.fix.with.ai.2ef90c9819',
        'Started an AI agent for this check.'
      )
    )
  }
  return started
}

export function useCheckRunDetailsFixWithAI(args: {
  worktreeId: string | null
  check: PRCheckDetail
  details: PRCheckRunDetails | null
}): {
  canFixWithAI: boolean
  disabledReason: string | undefined
  isFixing: boolean
  fixPrompt: string | null
  repoId: string | null
  connectionId: string | null | undefined
  launchPlatform: NodeJS.Platform | undefined
  savedAgentId: ReturnType<typeof readSourceControlLaunchRecipeAgentId>
  savedCommandInputTemplate: string | null
  savedAgentArgs: string | null
  saveLaunchActionDefault: (
    target: SourceControlAiWriteTarget,
    actionId: SourceControlLaunchActionId,
    recipe: SourceControlActionRecipe
  ) => Promise<void>
  openSourceControlAiSettings: () => void
  fixWithAI: () => Promise<boolean>
} {
  const [isFixing, setIsFixing] = useState(false)
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const updateRepo = useAppStore((state) => state.updateRepo)
  const openSettingsTarget = useAppStore((state) => state.openSettingsTarget)
  const openSettingsPage = useAppStore((state) => state.openSettingsPage)
  const projectRuntimeState = useProjectCatalogRuntimeState()
  const repo = (() => resolveCheckRunDetailsFixRepo(args.worktreeId))()
  const worktree = (() => {
    if (!args.worktreeId) {
      return null
    }
    return findWorktreeById(projectRuntimeState.worktreesByRepo, args.worktreeId)
  })()
  const canFixWithAI = isCheckRunDetailsFixCandidate(args.check, args.details)
  const disabledReason = getCheckRunDetailsFixDisabledReason(args.worktreeId)
  const fixPrompt = (() => {
    if (!args.worktreeId || !canFixWithAI) {
      return null
    }
    return buildCheckRunDetailsFixBasePrompt({
      worktreeId: args.worktreeId,
      check: args.check,
      details: args.details
    })
  })()
  // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
  // removed (#63) — getConnectionId already resolves to null for any found
  // repo, so a fallback read of repo.connectionId can never differ.
  const connectionId = args.worktreeId ? (getConnectionId(args.worktreeId) ?? null) : null
  const launchPlatform = resolveSourceControlLaunchPlatform({
    connectionId,
    worktreePath: worktree?.path ?? null
  })
  const fixChecksRecipe = (() =>
    resolveSourceControlActionRecipe({
      settings,
      repo,
      actionId: 'fixChecks'
    }))()
  const saveLaunchActionDefault = async (
    target: SourceControlAiWriteTarget,
    actionId: SourceControlLaunchActionId,
    recipe: SourceControlActionRecipe
  ): Promise<void> => {
    const state = useAppStore.getState()
    const latestSettings = state.settings
    if (!latestSettings) {
      throw new Error('Settings are not loaded.')
    }
    const latestRepo =
      target.type === 'repo'
        ? (projectRuntimeState.repos.find((candidate) => candidate.id === target.repoId) ?? null)
        : null
    const result = saveSourceControlActionRecipe({
      target,
      settings: latestSettings,
      repo: latestRepo,
      actionId,
      recipe
    })
    if ('sourceControlAi' in result) {
      await updateSettings({ sourceControlAi: result.sourceControlAi })
      return
    }
    await updateRepo(result.target.repoId, result.update)
  }
  const openSourceControlAiSettings = (): void => {
    openSourceControlAiSettingsTarget({
      activeRepo: repo,
      openSettingsTarget,
      openSettingsPage
    })
  }

  const fixWithAI = async (): Promise<boolean> => {
    if (!args.worktreeId || isFixing || disabledReason) {
      return false
    }
    setIsFixing(true)
    try {
      return await startCheckRunDetailsFixWithAI({
        worktreeId: args.worktreeId,
        check: args.check,
        details: args.details
      })
    } finally {
      setIsFixing(false)
    }
  }

  return {
    canFixWithAI,
    disabledReason,
    isFixing,
    fixPrompt,
    repoId: repo?.id ?? null,
    connectionId,
    launchPlatform,
    savedAgentId: readSourceControlLaunchRecipeAgentId(fixChecksRecipe),
    savedCommandInputTemplate: fixChecksRecipe.commandInputTemplate ?? null,
    savedAgentArgs: fixChecksRecipe.agentArgs ?? null,
    saveLaunchActionDefault,
    openSourceControlAiSettings,
    fixWithAI
  }
}
