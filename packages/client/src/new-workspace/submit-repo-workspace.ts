import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '@agentstart/protocol/agent/launch-defaults'
import { isTuiAgentEnabled } from '@agentstart/protocol/agent/selection'
import type { TuiAgent } from '@agentstart/protocol/agent/types'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type { WorkspaceSource as WorkspaceCreateTelemetrySource } from '@agentstart/protocol/workspace/source'
import type { WorkspaceStatus } from '@agentstart/protocol/workspace/status/model'
import type { SetupDecision } from '@agentstart/protocol/worktree/hooks'
import type { WorktreeMeta } from '@agentstart/protocol/worktree/model'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'
import type { AgentStartedTelemetry } from '~renderer/agent/started-telemetry'
import { buildAgentStartupPlan } from '~renderer/agent/tui-startup'
import { createBrowserUuid } from '~renderer/browser/uuid'
import { translate } from '~renderer/i18n/i18n'
import {
  formatWorkspaceCreateError,
  getWorkspaceCreateErrorToastMessage,
  type WorkspaceCreateErrorDisplay
} from '~renderer/new-workspace-composer-card/workspace-create-error-format'
import {
  buildAgentPromptWithContext,
  ensureAgentStartupInTerminal
} from '~renderer/new-workspace/workspace-creation'
import { ensureHooksConfirmed } from '~renderer/sidebar/agentstart-hook-confirmation'
import { getLinkedWorkItemPromptContext } from '~renderer/sidebar/linked-work-item-context'
import { useAppStore, type AppState } from '~renderer/store/state'
import { tuiAgentToAgentKind } from '~renderer/telemetry/client'
import { queueNewWorkspaceTerminalFocus } from '~renderer/worktree-creation/new-workspace-terminal-focus'
import { activateAndRevealWorktree } from '~renderer/worktree/activation'

import type { ComposerCreateResolution } from './composer-create-resolution'
import type { createComposerSubmissionGuard } from './composer-submission-guard'

type SubmitRepoWorkspaceOptions = {
  agent: TuiAgent
  agentPlatform: Parameters<typeof buildAgentStartupPlan>[0]['platform']
  agentPrompt: string
  attachmentPaths: string[]
  clearDraft: () => void
  createWorktree: AppState['createWorktree']
  disabledAgents: TuiAgent[]
  fallbackAgent: TuiAgent
  isDisabled: boolean
  isGit: boolean
  name: string
  note: string
  onCreated?: () => void
  persistDraft: boolean
  persistSetupAgentStartupPolicy: () => Promise<boolean>
  repoId: string
  resolveCreate: () => Promise<ComposerCreateResolution | null>
  resolvedSetupDecision: 'run' | 'skip' | null
  setCreateError: Dispatch<SetStateAction<WorkspaceCreateErrorDisplay | null>>
  setCreating: Dispatch<SetStateAction<boolean>>
  setFallbackAgent: Dispatch<SetStateAction<TuiAgent>>
  setSidebarOpen: AppState['setSidebarOpen']
  settings: GlobalSettings | null
  shell: Parameters<typeof buildAgentStartupPlan>[0]['shell']
  sparseCheckout: { directories: string[]; presetId?: string } | undefined
  submissionGuard: ReturnType<typeof createComposerSubmissionGuard>
  telemetrySource?: WorkspaceCreateTelemetrySource
  updateWorktreeMeta: AppState['updateWorktreeMeta']
  workspaceStatus: WorkspaceStatus | undefined
}

export async function submitRepoWorkspace(options: SubmitRepoWorkspaceOptions): Promise<void> {
  if (options.isDisabled) {
    return
  }
  if (!isTuiAgentEnabled(options.agent, options.disabledAgents)) {
    options.setFallbackAgent(options.fallbackAgent)
    toast.error(
      translate(
        'auto.hooks.useComposerState.7eb3f44ff7',
        'Selected agent is disabled. Choose an enabled agent before creating.'
      )
    )
    return
  }
  const submissionId = options.submissionGuard.begin()
  options.setCreateError(null)
  options.setCreating(true)
  try {
    const resolution = await options.resolveCreate()
    if (!options.submissionGuard.isCurrent(submissionId) || !resolution) {
      return
    }
    const linkedPromptContext = getLinkedWorkItemPromptContext(resolution.linkedWorkItem)
    const startupPrompt = buildAgentPromptWithContext(
      options.agentPrompt,
      options.attachmentPaths,
      linkedPromptContext.linkedUrls,
      linkedPromptContext.linkedContextBlocks
    )
    const setupTrustDecision = options.isGit
      ? await ensureHooksConfirmed(useAppStore.getState(), options.repoId, 'setup')
      : 'skip'
    const setupDecision: SetupDecision =
      setupTrustDecision === 'skip'
        ? 'skip'
        : ((options.resolvedSetupDecision ?? 'inherit') as SetupDecision)
    const pendingFirstAgentMessageRename =
      options.isGit &&
      options.settings?.autoRenameBranchFromWork === true &&
      !options.name.trim() &&
      !resolution.branchNameOverride &&
      !resolution.displayName
    const startupPlan = buildAgentStartupPlan({
      agent: options.agent,
      prompt: startupPrompt,
      cmdOverrides: options.settings?.agentCmdOverrides ?? {},
      agentArgs: resolveTuiAgentLaunchArgs(options.agent, options.settings?.agentDefaultArgs),
      agentEnv: resolveTuiAgentLaunchEnv(options.agent, options.settings?.agentDefaultEnv),
      platform: options.agentPlatform,
      shell: options.shell,
      isRemote: false
    })
    const shouldSeedInitialAgentStatus =
      options.agent === 'command-code' && startupPrompt.trim().length > 0
    const telemetry: AgentStartedTelemetry = {
      agent_kind: tuiAgentToAgentKind(options.agent),
      launch_source:
        options.telemetrySource === 'onboarding' ? 'onboarding' : 'new_workspace_composer',
      request_kind: 'new'
    }
    const backendStartup =
      startupPlan && !startupPlan.draftPrompt && !startupPlan.followupPrompt
        ? {
            command: startupPlan.launchCommand,
            ...(startupPlan.env ? { env: startupPlan.env } : {}),
            launchConfig: startupPlan.launchConfig,
            launchAgent: options.agent,
            ...(startupPlan.startupCommandDelivery
              ? { startupCommandDelivery: startupPlan.startupCommandDelivery }
              : {}),
            telemetry
          }
        : undefined
    if (!(await options.persistSetupAgentStartupPolicy())) {
      throw new Error(
        translate(
          'auto.hooks.useComposerState.setupAgentStartupPolicySaveFailed',
          'Failed to save setup startup behavior.'
        )
      )
    }
    if (!options.submissionGuard.isCurrent(submissionId)) {
      return
    }
    const result = await options.createWorktree(
      options.repoId,
      resolution.workspaceName,
      options.isGit ? resolution.baseBranch : undefined,
      setupDecision,
      options.isGit ? options.sparseCheckout : undefined,
      options.telemetrySource,
      resolution.displayName,
      resolution.linkedPR,
      resolution.pushTarget,
      options.agent,
      resolution.branchNameOverride,
      options.workspaceStatus,
      backendStartup,
      pendingFirstAgentMessageRename,
      undefined,
      resolution.compareBaseRef
    )
    await applyWorktreeMeta(options.updateWorktreeMeta, result.worktree.id, options.note)
    const backendSpawnedStartup = result.startupTerminal?.spawned === true
    if (startupPlan && !backendSpawnedStartup && !startupPlan.launchToken) {
      startupPlan.launchToken = createBrowserUuid()
    }
    const activation = activateAndRevealWorktree(result.worktree.id, {
      sidebarRevealBehavior: 'auto',
      setup: result.setup,
      defaultTabs: result.defaultTabs,
      ...(startupPlan && !backendSpawnedStartup
        ? {
            startup: {
              command: startupPlan.launchCommand,
              ...(startupPlan.env ? { env: startupPlan.env } : {}),
              launchConfig: startupPlan.launchConfig,
              ...(startupPlan.launchToken ? { launchToken: startupPlan.launchToken } : {}),
              launchAgent: options.agent,
              ...(startupPlan.draftPrompt ? { draftPrompt: startupPlan.draftPrompt } : {}),
              ...(startupPlan.startupCommandDelivery
                ? { startupCommandDelivery: startupPlan.startupCommandDelivery }
                : {}),
              ...(shouldSeedInitialAgentStatus
                ? { initialAgentStatus: { agent: options.agent, prompt: startupPrompt.trim() } }
                : {}),
              telemetry
            }
          }
        : {})
    })
    if (startupPlan && !backendSpawnedStartup) {
      void ensureAgentStartupInTerminal({
        worktreeId: result.worktree.id,
        primaryTabId: activation === false ? null : activation.primaryTabId,
        startup: startupPlan
      })
    }
    options.setSidebarOpen(true)
    if (options.persistDraft) {
      options.clearDraft()
    }
    options.onCreated?.()
    queueNewWorkspaceTerminalFocus(result.worktree.id, activation)
  } catch (error) {
    if (options.submissionGuard.isCurrent(submissionId)) {
      const formattedError = formatWorkspaceCreateError(error)
      options.setCreateError(formattedError)
      toast.error(getWorkspaceCreateErrorToastMessage(formattedError))
    }
  } finally {
    if (options.submissionGuard.isCurrent(submissionId)) {
      options.setCreating(false)
    }
  }
}

async function applyWorktreeMeta(
  updateWorktreeMeta: AppState['updateWorktreeMeta'],
  worktreeId: string,
  note: string
): Promise<void> {
  const trimmedNote = note.trim()
  if (!trimmedNote) {
    return
  }
  try {
    const meta: Partial<WorktreeMeta> = { comment: trimmedNote }
    await updateWorktreeMeta(worktreeId, meta)
  } catch {
    console.error('Failed to update worktree meta after creation')
  }
}
