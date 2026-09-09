import { TUI_AGENT_CONFIG } from '@yiru/protocol/agent/launch/config'
import type { CreateWorktreeResult } from '@yiru/protocol/worktree/create-result'
import { createBrowserUuid } from '~renderer/browser/uuid'
import { ensureAgentStartupInTerminal } from '~renderer/new-workspace/workspace-creation'
import { markAgentWorkspaceTrusted } from '~renderer/runtime/agent-trust-client'
import { useAppStore } from '~renderer/store/state'
import type { WorktreeCreationRequest } from '~renderer/worktree-creation/pending'
import {
  activateAndRevealKnownWorktree,
  ensureWorktreeHasInitialTerminal,
  type ActivateAndRevealResult,
  type WorktreeStartupPayload
} from '~renderer/worktree/activation'

import { queueNewWorkspaceTerminalFocus } from './new-workspace-terminal-focus'

function buildStartup(
  request: WorktreeCreationRequest,
  backendSpawned: boolean
): WorktreeStartupPayload | undefined {
  const plan = request.startupPlan
  if (!plan || backendSpawned) {
    return undefined
  }
  return {
    command: plan.launchCommand,
    ...(plan.env ? { env: plan.env } : {}),
    launchConfig: plan.launchConfig,
    ...(plan.launchToken ? { launchToken: plan.launchToken } : {}),
    ...(request.agent ? { launchAgent: request.agent } : {}),
    ...(plan.draftPrompt ? { draftPrompt: plan.draftPrompt } : {}),
    ...(plan.startupCommandDelivery ? { startupCommandDelivery: plan.startupCommandDelivery } : {}),
    // Why: command-code shows its prompt in the tab status before the first
    // hook fires, so the prompt is threaded through here.
    ...(request.agent === 'command-code' && request.quickPrompt.trim().length > 0
      ? { initialAgentStatus: { agent: request.agent, prompt: request.quickPrompt.trim() } }
      : {}),
    ...(request.quickTelemetry ? { telemetry: request.quickTelemetry } : {})
  }
}

function shouldActivate(creationId: string): boolean {
  const state = useAppStore.getState()
  return (
    state.pendingWorktreeCreations[creationId] !== undefined &&
    state.activeView === 'terminal' &&
    (state.activePendingCreationId === creationId || state.activePendingCreationId === null)
  )
}

async function markWorkspaceTrusted(request: WorktreeCreationRequest, path: string): Promise<void> {
  if (!request.agent) {
    return
  }
  const preflight = TUI_AGENT_CONFIG[request.agent].preflightTrust
  if (!preflight) {
    return
  }
  try {
    await markAgentWorkspaceTrusted({ preset: preflight, workspacePath: path })
  } catch {
    // Why: the worktree already exists, so trust setup cannot strand creation.
  }
}

function seedBackgroundTerminal(
  result: CreateWorktreeResult,
  startup: WorktreeStartupPayload | undefined
): string | null {
  return ensureWorktreeHasInitialTerminal(
    useAppStore.getState(),
    result.worktree.id,
    startup,
    result.setup,
    result.defaultTabs,
    { activateCreatedTabs: false }
  )
}

export async function completeWorktreeCreationHandoff(
  creationId: string,
  request: WorktreeCreationRequest,
  result: CreateWorktreeResult
): Promise<void> {
  const { worktree } = result
  if (!useAppStore.getState().pendingWorktreeCreations[creationId]) {
    return
  }

  const backendSpawned = result.startupTerminal?.spawned === true
  if (request.startupPlan && !backendSpawned && !request.startupPlan.launchToken) {
    // Why: delayed delivery must target the exact pane spawned from this queued startup.
    request.startupPlan.launchToken = createBrowserUuid()
  }
  const startup = buildStartup(request, backendSpawned)

  if (worktree.path) {
    await markWorkspaceTrusted(request, worktree.path)
  }

  const activationOptions = {
    sidebarRevealBehavior: 'auto',
    ...(result.setup ? { setup: result.setup } : {}),
    ...(result.defaultTabs ? { defaultTabs: result.defaultTabs } : {}),
    ...(startup ? { startup } : {})
  } satisfies NonNullable<Parameters<typeof activateAndRevealKnownWorktree>[1]>
  let activation: ActivateAndRevealResult | false = false
  if (shouldActivate(creationId)) {
    activation = activateAndRevealKnownWorktree(worktree, activationOptions)
  }
  const primaryTabId =
    activation === false ? seedBackgroundTerminal(result, startup) : activation.primaryTabId

  // Why: clear synchronously so panel→terminal commits without an empty frame.
  useAppStore.getState().removePendingWorktreeCreation(creationId)
  if (request.startupPlan && !backendSpawned) {
    void ensureAgentStartupInTerminal({
      worktreeId: worktree.id,
      primaryTabId,
      startup: request.startupPlan
    })
  }
  if (activation !== false && !request.suppressTerminalFocusOnCompletion) {
    queueNewWorkspaceTerminalFocus(worktree.id, activation)
  }

  if (request.note) {
    try {
      await useAppStore.getState().updateWorktreeMeta(worktree.id, { comment: request.note })
    } catch {
      console.error('Failed to update worktree meta after creation')
    }
  }
}
