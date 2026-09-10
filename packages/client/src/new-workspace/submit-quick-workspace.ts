import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '@agentstart/protocol/agent/launch-defaults'
import { isTuiAgentEnabled } from '@agentstart/protocol/agent/selection'
import type { TuiAgent } from '@agentstart/protocol/agent/types'
import type { Repo } from '@agentstart/protocol/project/repository'
import type { ProjectSourceContext } from '@agentstart/protocol/project/source-context'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type { WorkspaceSource as WorkspaceCreateTelemetrySource } from '@agentstart/protocol/workspace/source'
import type { WorkspaceStatus } from '@agentstart/protocol/workspace/status/model'
import type { SetupDecision, SetupRunPolicy } from '@agentstart/protocol/worktree/hooks'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'
import type { AgentStartedTelemetry } from '~renderer/agent/started-telemetry'
import { buildAgentDraftLaunchPlan, buildAgentStartupPlan } from '~renderer/agent/tui-startup'
import { translate } from '~renderer/i18n/i18n'
import {
  formatWorkspaceCreateError,
  getWorkspaceCreateErrorToastMessage,
  type WorkspaceCreateErrorDisplay
} from '~renderer/new-workspace-composer-card/workspace-create-error-format'
import { getSetupConfig, type SetupConfig } from '~renderer/new-workspace/workspace-creation'
import type { HookCheckResult } from '~renderer/runtime/hooks-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { resolveWorktreeCreateBaseBranch } from '~renderer/runtime/worktree-create-base'
import { ensureHooksConfirmed } from '~renderer/sidebar/agentstart-hook-confirmation'
import { resolveQuickCreateLinkedWorkItemPrompt } from '~renderer/sidebar/linked-work-item-context'
import { useAppStore } from '~renderer/store/state'
import { tuiAgentToAgentKind } from '~renderer/telemetry/client'
import { runBackgroundWorktreeCreation } from '~renderer/worktree-creation/flow'
import type { WorktreeCreationRequest } from '~renderer/worktree-creation/pending'

import type { ComposerCreateResolution } from './composer-create-resolution'
import type { createComposerSubmissionGuard } from './composer-submission-guard'
import type { WorkspaceCreationTargetResolution } from './project-host-workspace-target'

type SubmitQuickWorkspaceOptions = {
  agentPlatform: Parameters<typeof buildAgentStartupPlan>[0]['platform']
  checkedHooksRepoId: string | null
  clearDraft: () => void
  commitHookCheckIfCurrent: (repoId: string, hooks: HookCheckResult['hooks']) => boolean
  createMultiple: boolean
  disabledAgents: TuiAgent[]
  isGit: boolean
  loadHookCheckForRepo: (repoId: string) => Promise<HookCheckResult>
  name: string
  note: string
  onCreated?: () => void
  persistDraft: boolean
  persistSetupAgentStartupPolicy: () => Promise<boolean>
  projectSourceContext: ProjectSourceContext | null
  repo: Repo
  repoId: string
  repoSettings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
  requestedAgent: TuiAgent | null
  resetForNextCreate: () => void
  resolveCreate: () => Promise<ComposerCreateResolution | null>
  resolvedSetupDecision: 'run' | 'skip' | null
  selectedWorkspaceTarget: WorkspaceCreationTargetResolution
  setAdvancedOpen: Dispatch<SetStateAction<boolean>>
  setCreateError: Dispatch<SetStateAction<WorkspaceCreateErrorDisplay | null>>
  setCreating: Dispatch<SetStateAction<boolean>>
  settings: GlobalSettings | null
  setupConfig: SetupConfig | null
  setupDecision: 'run' | 'skip' | null
  setupPolicy: SetupRunPolicy
  shell: Parameters<typeof buildAgentStartupPlan>[0]['shell']
  sparseCheckout: { directories: string[]; presetId?: string } | undefined
  submissionGuard: ReturnType<typeof createComposerSubmissionGuard>
  telemetrySource?: WorkspaceCreateTelemetrySource
  workspaceStatus: WorkspaceStatus | undefined
}

export async function submitQuickWorkspace(options: SubmitQuickWorkspaceOptions): Promise<void> {
  const submissionId = options.submissionGuard.begin()
  options.setCreateError(null)
  options.setCreating(true)
  try {
    const resolution = await options.resolveCreate()
    if (!options.submissionGuard.isCurrent(submissionId) || !resolution) {
      return
    }
    const agent =
      options.requestedAgent && isTuiAgentEnabled(options.requestedAgent, options.disabledAgents)
        ? options.requestedAgent
        : null
    const setupDecision = await resolveSetupDecision(options)
    if (setupDecision === null) {
      return
    }
    const baseBranch = options.isGit
      ? await resolveWorktreeCreateBaseBranch({ explicitBaseBranch: resolution.baseBranch })
      : undefined
    const pendingFirstAgentMessageRename =
      options.isGit &&
      options.settings?.autoRenameBranchFromWork === true &&
      !options.name.trim() &&
      Boolean(agent) &&
      !resolution.branchNameOverride &&
      !resolution.displayName
    const trimmedNote = options.note.trim()
    const promptLinkedWorkItem = agent === null ? null : resolution.linkedWorkItem
    const { prompt: quickPrompt, draftPrompt } = resolveQuickCreateLinkedWorkItemPrompt(
      promptLinkedWorkItem,
      trimmedNote
    )
    const startupPlan = buildQuickStartupPlan(options, agent, quickPrompt, draftPrompt)
    const telemetry: AgentStartedTelemetry | null = agent
      ? {
          agent_kind: tuiAgentToAgentKind(agent),
          launch_source:
            options.telemetrySource === 'onboarding' ? 'onboarding' : 'new_workspace_composer',
          request_kind: 'new'
        }
      : null
    const backendStartup =
      startupPlan && !startupPlan.draftPrompt && !startupPlan.followupPrompt
        ? {
            command: startupPlan.launchCommand,
            ...(startupPlan.env ? { env: startupPlan.env } : {}),
            launchConfig: startupPlan.launchConfig,
            ...(agent ? { launchAgent: agent } : {}),
            ...(startupPlan.startupCommandDelivery
              ? { startupCommandDelivery: startupPlan.startupCommandDelivery }
              : {}),
            ...(telemetry ? { telemetry } : {})
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
    const workspaceRunContext =
      options.selectedWorkspaceTarget.status === 'ready'
        ? {
            kind: 'workspace-run' as const,
            projectId: options.selectedWorkspaceTarget.target.projectId,
            hostId: options.selectedWorkspaceTarget.target.hostId,
            projectHostSetupId: options.selectedWorkspaceTarget.target.projectHostSetupId,
            repoId: options.selectedWorkspaceTarget.target.repoId,
            path: options.selectedWorkspaceTarget.target.repo.path
          }
        : null
    const request: WorktreeCreationRequest = {
      repoId: options.repoId,
      worktreeCreateProgressMode:
        getActiveRuntimeTarget(options.repoSettings).kind !== 'local' ? 'indeterminate' : 'stepped',
      ...(options.projectSourceContext
        ? { projectSourceContext: options.projectSourceContext }
        : {}),
      ...(workspaceRunContext ? { workspaceRunContext } : {}),
      name: resolution.workspaceName,
      ...(resolution.displayName ? { displayName: resolution.displayName } : {}),
      ...(options.isGit && baseBranch ? { baseBranch } : {}),
      ...(options.isGit && resolution.compareBaseRef
        ? { compareBaseRef: resolution.compareBaseRef }
        : {}),
      setupDecision,
      ...(options.isGit && options.sparseCheckout
        ? { sparseCheckout: options.sparseCheckout }
        : {}),
      ...(options.telemetrySource ? { telemetrySource: options.telemetrySource } : {}),
      ...(resolution.linkedPR !== undefined ? { linkedPR: resolution.linkedPR } : {}),
      ...(resolution.pushTarget ? { pushTarget: resolution.pushTarget } : {}),
      agent,
      ...(resolution.branchNameOverride
        ? { branchNameOverride: resolution.branchNameOverride }
        : {}),
      ...(options.workspaceStatus ? { workspaceStatus: options.workspaceStatus } : {}),
      ...(backendStartup ? { startup: backendStartup } : {}),
      pendingFirstAgentMessageRename,
      note: trimmedNote,
      startupPlan,
      quickPrompt,
      quickTelemetry: telemetry,
      ...(options.createMultiple ? { suppressTerminalFocusOnCompletion: true } : {})
    }
    if (options.persistDraft) {
      options.clearDraft()
    }
    runBackgroundWorktreeCreation(request)
    if (options.createMultiple) {
      options.resetForNextCreate()
    } else {
      options.onCreated?.()
    }
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

async function resolveSetupDecision(
  options: SubmitQuickWorkspaceOptions
): Promise<SetupDecision | null> {
  let setupConfig = options.setupConfig
  let decision = options.resolvedSetupDecision
  if (options.isGit && options.checkedHooksRepoId !== options.repoId) {
    let hookCheck: HookCheckResult
    try {
      hookCheck = await options.loadHookCheckForRepo(options.repoId)
    } catch {
      hookCheck = { hasHooks: false, hooks: null, mayNeedUpdate: false }
    }
    if (!options.commitHookCheckIfCurrent(options.repoId, hookCheck.hooks)) {
      return null
    }
    setupConfig = getSetupConfig(options.repo, hookCheck.hooks)
    decision =
      options.setupDecision ??
      (!setupConfig || options.setupPolicy === 'ask'
        ? null
        : options.setupPolicy === 'run-by-default'
          ? 'run'
          : 'skip')
  }
  if (options.isGit && setupConfig && options.setupPolicy === 'ask' && !options.setupDecision) {
    options.setAdvancedOpen(true)
    return null
  }
  const trustDecision = options.isGit
    ? await ensureHooksConfirmed(useAppStore.getState(), options.repoId, 'setup')
    : 'skip'
  return trustDecision === 'skip' ? 'skip' : ((decision ?? 'inherit') as SetupDecision)
}

function buildQuickStartupPlan(
  options: SubmitQuickWorkspaceOptions,
  agent: TuiAgent | null,
  prompt: string,
  draftPrompt: string | null
): ReturnType<typeof buildAgentStartupPlan> {
  if (agent === null) {
    return null
  }
  if (draftPrompt) {
    const draftPlan = buildAgentDraftLaunchPlan({
      agent,
      draft: draftPrompt,
      cmdOverrides: options.settings?.agentCmdOverrides ?? {},
      agentArgs: resolveTuiAgentLaunchArgs(agent, options.settings?.agentDefaultArgs),
      agentEnv: resolveTuiAgentLaunchEnv(agent, options.settings?.agentDefaultEnv),
      platform: options.agentPlatform,
      shell: options.shell,
      isRemote: false
    })
    if (draftPlan) {
      return {
        agent: draftPlan.agent,
        launchCommand: draftPlan.launchCommand,
        expectedProcess: draftPlan.expectedProcess,
        followupPrompt: null,
        launchConfig: draftPlan.launchConfig,
        ...(draftPlan.sessionOptions ? { sessionOptions: draftPlan.sessionOptions } : {}),
        ...(draftPlan.startupCommandDelivery
          ? { startupCommandDelivery: draftPlan.startupCommandDelivery }
          : {}),
        ...(draftPlan.env ? { env: draftPlan.env } : {})
      }
    }
  }
  const startupPlan = buildAgentStartupPlan({
    agent,
    prompt,
    cmdOverrides: options.settings?.agentCmdOverrides ?? {},
    agentArgs: resolveTuiAgentLaunchArgs(agent, options.settings?.agentDefaultArgs),
    agentEnv: resolveTuiAgentLaunchEnv(agent, options.settings?.agentDefaultEnv),
    platform: options.agentPlatform,
    shell: options.shell,
    isRemote: false,
    allowEmptyPromptLaunch: true
  })
  if (startupPlan && draftPrompt) {
    startupPlan.draftPrompt = draftPrompt
  }
  return startupPlan
}
