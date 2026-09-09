import type { GitStatusEntry } from '@yiru/protocol/git/status-types'
import type {
  SourceControlActionRecipe,
  SourceControlLaunchActionId
} from '@yiru/protocol/source-control/ai-actions'
import { useState } from 'react'

import { summarizeCommitFailure } from '../commit-failure-summary'
import type { SourceControlAiStoreSnapshot } from './ai-controller-types'
import { buildFixCommitFailurePrompt } from './ai-prompts'
import {
  getDefaultSourceControlRecoveryLaunchCopy,
  launchSourceControlRecoveryAgentWithDefault
} from './ai-recovery-launch'

type SourceControlRecoveryAiParams = {
  activeWorktreeId: string | null | undefined
  activeGroupId: string | null | undefined
  activeSourceControlLaunchPlatform: NodeJS.Platform
  sourceRepoConnectionId?: string | null
  worktreePath: string | null
  commitMessage: string
  commitError: string | null
  pushRecoveryPrompt: string | null
  stagedEntries: Pick<GitStatusEntry, 'path' | 'status' | 'area'>[]
  getLaunchActionRecipe: (actionId: SourceControlLaunchActionId) => SourceControlActionRecipe
  getStoreState: () => SourceControlAiStoreSnapshot
}

export function useSourceControlRecoveryAi({
  activeWorktreeId,
  activeGroupId,
  activeSourceControlLaunchPlatform,
  sourceRepoConnectionId,
  worktreePath,
  commitMessage,
  commitError,
  pushRecoveryPrompt,
  stagedEntries,
  getLaunchActionRecipe,
  getStoreState
}: SourceControlRecoveryAiParams) {
  const [isLaunchingCommitFailureAgent, setIsLaunchingCommitFailureAgent] = useState(false)
  const [isLaunchingPushFailureAgent, setIsLaunchingPushFailureAgent] = useState(false)

  const commitFailureRecoveryPrompt = (() =>
    commitError
      ? buildFixCommitFailurePrompt({
          summary: summarizeCommitFailure(commitError),
          error: commitError,
          entries: stagedEntries,
          worktreePath,
          commitMessage
        })
      : null)()
  const handleFixCommitFailureWithAI = async (promptOverride?: string): Promise<boolean> => {
    if (isLaunchingCommitFailureAgent || !activeWorktreeId || !commitError) {
      return false
    }

    setIsLaunchingCommitFailureAgent(true)
    try {
      return await launchSourceControlRecoveryAgentWithDefault({
        activeWorktreeId,
        activeGroupId,
        activeSourceControlLaunchPlatform,
        sourceRepoConnectionId,
        actionId: 'fixCommitFailure',
        basePrompt: commitFailureRecoveryPrompt,
        promptOverride,
        getLaunchActionRecipe,
        getStoreState,
        copy: getDefaultSourceControlRecoveryLaunchCopy('commit')
      })
    } finally {
      setIsLaunchingCommitFailureAgent(false)
    }
  }

  const handleFixPushFailureWithAI = async (promptOverride?: string): Promise<boolean> => {
    if (isLaunchingPushFailureAgent || !activeWorktreeId || !pushRecoveryPrompt) {
      return false
    }

    setIsLaunchingPushFailureAgent(true)
    try {
      return await launchSourceControlRecoveryAgentWithDefault({
        activeWorktreeId,
        activeGroupId,
        activeSourceControlLaunchPlatform,
        sourceRepoConnectionId,
        actionId: 'fixPushFailure',
        basePrompt: pushRecoveryPrompt,
        promptOverride,
        getLaunchActionRecipe,
        getStoreState,
        copy: getDefaultSourceControlRecoveryLaunchCopy('push')
      })
    } finally {
      setIsLaunchingPushFailureAgent(false)
    }
  }

  return {
    isLaunchingCommitFailureAgent,
    isLaunchingPushFailureAgent,
    commitFailureRecoveryPrompt,
    pushFailureRecoveryPrompt: pushRecoveryPrompt,
    handleFixCommitFailureWithAI,
    handleFixPushFailureWithAI
  }
}
