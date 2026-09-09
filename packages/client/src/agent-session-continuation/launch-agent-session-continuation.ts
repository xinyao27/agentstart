import { TUI_AGENT_CONFIG } from '@yiru/protocol/agent/launch/config'
import { isTuiAgentEnabled } from '@yiru/protocol/agent/selection'
import type { SessionOptionValue } from '@yiru/protocol/agent/session-options/types'
import type { TuiAgent } from '@yiru/protocol/agent/types'
import type { LaunchSource } from '@yiru/protocol/telemetry/events/foundations'
import { toast } from 'sonner'
import { getAgentLabel } from '~renderer/agent/catalog'
import { launchAgentInNewTab } from '~renderer/agent/launch-in-new-tab'
import { translate } from '~renderer/i18n/i18n'
import { markAgentWorkspaceTrusted } from '~renderer/runtime/agent-trust-client'
import { getConnectionIdFromState } from '~renderer/runtime/connection-context'
import { useAppStore } from '~renderer/store/state'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

type LaunchAgentSessionContinuationArgs = {
  agent: TuiAgent
  prompt: string
  worktreeId: string
  groupId?: string | null
  workspacePath: string
  initialCwd?: string | null
  launchSource: LaunchSource
  /** Model and option picks for the new session. Some agents only accept these
   *  as launch flags, so a relaunch is the only way to change them. */
  sessionOptions?: Record<string, SessionOptionValue>
}

export async function detectAgentSessionContinuationAgents(
  worktreeId: string
): Promise<TuiAgent[]> {
  const state = useAppStore.getState()
  const connectionId = getConnectionIdFromState(state, worktreeId)
  const runtimeEnvironmentId = getRuntimeEnvironmentIdForWorktree(state, worktreeId)
  return connectionId
    ? state.ensureRemoteDetectedAgents(connectionId)
    : runtimeEnvironmentId
      ? state.ensureRuntimeDetectedAgents(runtimeEnvironmentId)
      : state.ensureDetectedAgents(worktreeId)
}

async function ensureAgentAvailable(agent: TuiAgent, worktreeId: string): Promise<boolean> {
  const state = useAppStore.getState()
  const label = getAgentLabel(agent)
  if (!isTuiAgentEnabled(agent, state.settings?.disabledTuiAgents)) {
    toast.error(
      translate(
        'components.agentSessionContinuation.agentDisabled',
        '{{agent}} is disabled in Agent settings.',
        { agent: label }
      )
    )
    return false
  }

  let detectedAgents: TuiAgent[]
  try {
    detectedAgents = await detectAgentSessionContinuationAgents(worktreeId)
  } catch (error) {
    console.error('Agent detection failed for session continuation', error)
    detectedAgents = []
  }
  if (detectedAgents.includes(agent)) {
    return true
  }

  toast.error(
    translate(
      'components.agentSessionContinuation.agentUnavailable',
      '{{agent}} was not detected on this workspace host.',
      { agent: label }
    )
  )
  return false
}

async function preflightAgentTrust(args: {
  agent: TuiAgent
  workspacePath: string
}): Promise<void> {
  const preset = TUI_AGENT_CONFIG[args.agent].preflightTrust
  if (!preset || !args.workspacePath) {
    return
  }
  try {
    await markAgentWorkspaceTrusted({
      preset,
      workspacePath: args.workspacePath
    })
  } catch {
    // Why: a failed best-effort trust write should not discard a prepared handoff.
  }
}

export async function launchAgentSessionContinuation({
  agent,
  prompt,
  worktreeId,
  groupId,
  workspacePath,
  initialCwd,
  launchSource,
  sessionOptions
}: LaunchAgentSessionContinuationArgs): Promise<boolean> {
  if (!(await ensureAgentAvailable(agent, worktreeId))) {
    return false
  }

  await preflightAgentTrust({ agent, workspacePath })

  const label = getAgentLabel(agent)
  const result = await launchAgentInNewTab({
    agent,
    worktreeId,
    ...(groupId ? { groupId } : {}),
    prompt,
    promptDelivery: 'submit-after-ready',
    launchSource,
    ...(initialCwd ? { initialCwd } : {}),
    ...(sessionOptions ? { sessionOptions } : {}),
    onPromptDelivered: () =>
      toast.success(
        translate(
          'components.agentSessionContinuation.sent',
          'Session context sent to {{agent}} in a new session.',
          { agent: label }
        )
      )
  })
  if (!result) {
    notifyLaunchFailed(label)
    return false
  }

  if (result.promptDeliveryResult) {
    void result.promptDeliveryResult
      .then((delivery) => {
        if (!delivery.delivered && !delivery.failureNotified) {
          notifyDeliveryFailed(label)
        }
      })
      .catch((error) => {
        console.error('Agent session continuation prompt delivery failed', error)
        notifyDeliveryFailed(label)
      })
  }
  return true
}

function notifyLaunchFailed(agentLabel: string): void {
  toast.error(
    translate(
      'components.agentSessionContinuation.launchFailed',
      'Could not start a new {{agent}} session.',
      { agent: agentLabel }
    )
  )
}

function notifyDeliveryFailed(agentLabel: string): void {
  toast.error(
    translate(
      'components.agentSessionContinuation.deliveryFailed',
      'The new {{agent}} session started, but its context could not be sent.',
      { agent: agentLabel }
    )
  )
}
