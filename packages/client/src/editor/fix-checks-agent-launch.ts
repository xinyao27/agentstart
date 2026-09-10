import { isTuiAgentEnabled } from '@agentstart/protocol/agent/selection'
import { planAgentCliArgsSuffix } from '@agentstart/protocol/agent/shell-command'
import type { TuiAgent } from '@agentstart/protocol/agent/types'
import type { GitHubWorkItem } from '@agentstart/protocol/hosted-review/review-types'
import { renderSourceControlActionCommandTemplate } from '@agentstart/protocol/source-control/action-recipes'
import { DEFAULT_SOURCE_CONTROL_ACTION_COMMAND_TEMPLATES } from '@agentstart/protocol/source-control/ai-actions'
import { resolveSourceControlActionRecipe } from '@agentstart/protocol/source-control/resolution'
import type { LaunchSource } from '@agentstart/protocol/telemetry/events/foundations'
import type { WorkspaceSource as WorkspaceCreateTelemetrySource } from '@agentstart/protocol/workspace/source'
import { toast } from 'sonner'
import { launchAgentInNewTab } from '~renderer/agent/launch-in-new-tab'
import { startupCommandErrorMessage } from '~renderer/agent/startup-error'
import { findGithubPrWorkspaceAttachment } from '~renderer/editor/github-work-item-workspace-attachment'
import { translate } from '~renderer/i18n/i18n'
import { CLIENT_PLATFORM } from '~renderer/new-workspace/workspace-creation'
import { getLocalProjectExecutionRuntimeContext } from '~renderer/preflight/context'
import { getConnectionId } from '~renderer/runtime/connection-context'
import { resolveSourceControlLaunchPlatform } from '~renderer/source-control/agent-platform'
import {
  pickSourceControlLaunchAgent,
  readSourceControlLaunchRecipeAgentId
} from '~renderer/source-control/agent-selection'
import { useAppStore } from '~renderer/store/state'
import { focusTerminalTabSurface } from '~renderer/tab-bar/focus-terminal-surface'
import { activateAndRevealWorktree } from '~renderer/worktree/activation'

type StartFixChecksAgentArgs = {
  repoId: string
  basePrompt: string
  item?: GitHubWorkItem
  worktreeId?: string | null
  groupId?: string | null
  launchSource: LaunchSource
  telemetrySource?: WorkspaceCreateTelemetrySource
  openModalFallback?: () => void
}

async function detectAgentsForConnection(
  connectionId: string | null | undefined
): Promise<TuiAgent[]> {
  const store = useAppStore.getState()
  return typeof connectionId === 'string'
    ? await store.ensureRemoteDetectedAgents(connectionId)
    : await store.ensureDetectedAgents()
}

function isAgentAvailable(agent: TuiAgent, detectedAgents: TuiAgent[]): boolean {
  return (
    detectedAgents.includes(agent) &&
    isTuiAgentEnabled(agent, useAppStore.getState().settings?.disabledTuiAgents)
  )
}

async function pickExistingWorktreeAgent(
  worktreeId: string,
  savedAgent: TuiAgent | null | undefined,
  repoConnectionId: string | null | undefined
): Promise<TuiAgent | null> {
  const connectionId = getConnectionId(worktreeId) ?? repoConnectionId ?? null
  const detectedAgents = await detectAgentsForConnection(connectionId)
  if (savedAgent) {
    if (isAgentAvailable(savedAgent, detectedAgents)) {
      return savedAgent
    }
    toast.error(
      translate(
        'auto.lib.fix.checks.agent.launch.4c7f783a7a',
        'Saved checks agent is not available on this workspace host.'
      )
    )
    return null
  }
  const settings = useAppStore.getState().settings
  const agent = pickSourceControlLaunchAgent({
    defaultAgent: settings?.defaultTuiAgent,
    detectedAgents,
    disabledAgents: settings?.disabledTuiAgents
  })
  if (!agent) {
    toast.error(
      translate(
        'auto.lib.fix.checks.agent.launch.2ebf794906',
        'No enabled AI agent was detected on this workspace host.'
      )
    )
  }
  return agent
}

export async function startFixChecksAgent(args: StartFixChecksAgentArgs): Promise<boolean> {
  const store = useAppStore.getState()
  const repo = store.repos.find((candidate) => candidate.id === args.repoId) ?? null
  const recipe = resolveSourceControlActionRecipe({
    settings: store.settings,
    repo,
    actionId: 'fixChecks'
  })
  const savedAgentId = readSourceControlLaunchRecipeAgentId(recipe)
  const commandInput = renderSourceControlActionCommandTemplate(
    recipe.commandInputTemplate ?? DEFAULT_SOURCE_CONTROL_ACTION_COMMAND_TEMPLATES.fixChecks,
    { basePrompt: args.basePrompt }
  ).trim()
  if (!commandInput) {
    toast.error(
      translate(
        'auto.lib.fix.checks.agent.launch.9f00d7df0c',
        'Fix checks prompt is empty. Update Source Control AI settings.'
      )
    )
    return false
  }

  const attachedWorkspace =
    args.worktreeId || !args.item
      ? null
      : findGithubPrWorkspaceAttachment(store.allWorktrees(), args.repoId, args.item.number)
  const targetWorktreeId = args.worktreeId ?? attachedWorkspace?.id ?? null
  if (targetWorktreeId) {
    const targetWorktree = store.allWorktrees().find((worktree) => worktree.id === targetWorktreeId)
    if (!targetWorktree) {
      toast.error(
        translate(
          'auto.lib.fix.checks.agent.launch.dfb4dd7c00',
          'Unable to find the workspace attached to these checks.'
        )
      )
      return false
    }
    // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
    // removed (#63) — getConnectionId already resolves to null for any found
    // repo, so a fallback read of repo.connectionId can never differ.
    const targetConnectionId = getConnectionId(targetWorktreeId) ?? null
    const agent = await pickExistingWorktreeAgent(targetWorktreeId, savedAgentId, null)
    if (!agent) {
      return false
    }
    const launchPlatform = resolveSourceControlLaunchPlatform({
      connectionId: targetConnectionId,
      worktreePath: targetWorktree.path,
      projectRuntime: targetConnectionId
        ? undefined
        : getLocalProjectExecutionRuntimeContext(store, targetWorktreeId, CLIENT_PLATFORM)
    })
    if (!launchPlatform) {
      toast.error(
        translate(
          'auto.lib.fix.checks.agent.launch.822bf52295',
          'Unable to resolve the workspace launch platform.'
        )
      )
      return false
    }
    const agentArgsPlan = planAgentCliArgsSuffix(
      recipe.agentArgs,
      launchPlatform === 'win32' ? 'powershell' : 'posix'
    )
    if (!agentArgsPlan.ok) {
      toast.error(startupCommandErrorMessage(agentArgsPlan.error))
      return false
    }
    if (!activateAndRevealWorktree(targetWorktreeId)) {
      toast.error(
        translate(
          'auto.lib.fix.checks.agent.launch.03c1d61f83',
          'Unable to open the workspace attached to these checks.'
        )
      )
      return false
    }
    const result = await launchAgentInNewTab({
      agent,
      worktreeId: targetWorktreeId,
      groupId: args.groupId ?? targetWorktreeId,
      prompt: commandInput,
      agentArgs: recipe.agentArgs,
      promptDelivery: 'submit-after-ready',
      launchPlatform,
      launchSource: args.launchSource
    })
    if (!result) {
      toast.error(
        translate(
          'auto.lib.fix.checks.agent.launch.fb6c294e85',
          'Could not build the agent launch command.'
        )
      )
      return false
    }
    if (result.tabId) {
      focusTerminalTabSurface(result.tabId)
    }
    return true
  }

  if (!args.item || !args.openModalFallback) {
    toast.error(
      translate(
        'auto.lib.fix.checks.agent.launch.027228a06b',
        'Unable to find a workspace for these checks.'
      )
    )
    return false
  }

  // Why: without an attached workspace, let the PR-aware composer resolve the
  // review start point instead of maintaining a second task-launch pipeline.
  args.openModalFallback()
  return true
}
