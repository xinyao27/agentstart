import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { ONBOARDING_FINAL_STEP } from '@agentstart/protocol/settings/onboarding'
import type { Worktree } from '@agentstart/protocol/worktree/model'
import { buildOnboardingFolderAgentStartup } from '~renderer/onboarding/folder-agent-startup'
import { track } from '~renderer/telemetry/client'
import { activateAndRevealWorktree } from '~renderer/worktree/activation'

import type { OpenProjectDefaultCheckout } from '../sidebar/project-added-default-checkout'
import type { useCloseWith } from './use-onboarding-flow-persistence'

type CompleteOnboardingProjectOptions = {
  projectId: string
  isGit: boolean
  path: 'open_folder' | 'clone_url'
  settings: GlobalSettings | null
  openProjectDefaultCheckout: OpenProjectDefaultCheckout
  refreshProjectWorktrees: (projectId: string) => Promise<Worktree[]>
  setHideDefaultBranchWorkspace: (value: boolean) => void
  closeWith: ReturnType<typeof useCloseWith>
  consumeStepDurationMs: () => number
}

export async function completeOnboardingProject({
  projectId,
  isGit,
  path,
  settings,
  openProjectDefaultCheckout,
  refreshProjectWorktrees,
  setHideDefaultBranchWorkspace,
  closeWith,
  consumeStepDurationMs
}: CompleteOnboardingProjectOptions): Promise<void> {
  const worktrees = await refreshProjectWorktrees(projectId)
  if (isGit) {
    await openProjectDefaultCheckout({
      project: projectId,
      source: path === 'clone_url' ? 'onboarding_clone_url' : 'onboarding_open_folder',
      setHideDefaultBranchWorkspace
    })
  } else {
    const worktree = worktrees[0] ?? null
    if (worktree) {
      const startup = buildOnboardingFolderAgentStartup(settings)
      activateAndRevealWorktree(worktree.id, { startup })
    }
  }
  const closed = await closeWith(
    'completed',
    isGit ? { addedRepo: true } : { addedFolder: true },
    ONBOARDING_FINAL_STEP,
    path
  )
  if (!closed) {
    return
  }
  track('onboarding_step_completed', {
    step: ONBOARDING_FINAL_STEP,
    value_kind: 'repo',
    duration_ms: consumeStepDurationMs()
  })
}
