import { TUI_AGENT_CONFIG } from '@yiru/protocol/agent/launch/config'
import { isTuiAgentEnabled } from '@yiru/protocol/agent/selection'
import type { SessionOptionValue } from '@yiru/protocol/agent/session-options/types'
import { planAgentCliArgsSuffix } from '@yiru/protocol/agent/shell-command'
import type { TuiAgent } from '@yiru/protocol/agent/types'
import { resolveLocalWindowsAgentStartupShell } from '@yiru/protocol/host/windows-terminal-shell'
import { startupCommandErrorMessage } from '~renderer/agent/startup-error'
import {
  buildAgentDraftLaunchPlan,
  buildAgentStartupPlan,
  type AgentStartupPlan
} from '~renderer/agent/tui-startup'
import { translate } from '~renderer/i18n/i18n'
import { CLIENT_PLATFORM } from '~renderer/new-workspace/workspace-creation'

export type SourceControlLaunchPlanDelivery =
  | 'argv'
  | 'draft-native'
  | 'draft-paste'
  | 'paste-submit'

export type SourceControlLaunchPlanResult =
  | {
      ok: true
      plan: AgentStartupPlan
      delivery: SourceControlLaunchPlanDelivery
      commandLabel: string
      summary: string
      caveat: string
    }
  | { ok: false; error: string }

export function planSourceControlAgentActionLaunch(args: {
  agent: TuiAgent | null
  commandInput: string
  promptDelivery: 'auto-submit' | 'draft' | 'submit-after-ready'
  detectedAgents: TuiAgent[]
  disabledAgents?: TuiAgent[]
  cmdOverrides?: Partial<Record<TuiAgent, string>>
  agentArgs?: string | null
  sessionOptions?: Record<string, SessionOptionValue>
  platform?: NodeJS.Platform
  terminalWindowsShell?: string | null
  /** Why: SSH remotes must use the relay's public CLI command. */
  isRemote?: boolean
}): SourceControlLaunchPlanResult {
  const agent = args.agent
  if (!agent) {
    return {
      ok: false,
      error: translate(
        'auto.lib.source.control.agent.action.plan.a7ac8717c7',
        'Choose an agent before starting.'
      )
    }
  }
  if (!isTuiAgentEnabled(agent, args.disabledAgents)) {
    return {
      ok: false,
      error: translate(
        'auto.lib.source.control.agent.action.plan.b96e091fc9',
        'The selected agent is disabled in Settings.'
      )
    }
  }
  if (!args.detectedAgents.includes(agent)) {
    return {
      ok: false,
      error: translate(
        'auto.lib.source.control.agent.action.plan.8eb541cc83',
        'The selected agent was not detected on this workspace host.'
      )
    }
  }

  const trimmedInput = args.commandInput.trim()
  if (!trimmedInput) {
    return {
      ok: false,
      error: translate(
        'auto.lib.source.control.agent.action.plan.46f1a2c9bd',
        'Command input is empty.'
      )
    }
  }

  const cmdOverrides = args.cmdOverrides ?? {}
  const platform = args.platform ?? CLIENT_PLATFORM
  const isRemote = args.isRemote ?? false
  const shell =
    resolveLocalWindowsAgentStartupShell({
      platform,
      isRemote,
      terminalWindowsShell: args.terminalWindowsShell
    }) ?? (platform === 'win32' ? 'powershell' : 'posix')
  const plannedArgs = planAgentCliArgsSuffix(args.agentArgs, shell)
  if (!plannedArgs.ok) {
    return { ok: false, error: startupCommandErrorMessage(plannedArgs.error) }
  }
  let startupPlan: AgentStartupPlan | null = null
  let delivery: SourceControlLaunchPlanDelivery

  if (args.promptDelivery === 'submit-after-ready') {
    startupPlan = buildAgentStartupPlan({
      agent,
      prompt: '',
      cmdOverrides,
      platform,
      shell,
      isRemote,
      agentArgs: args.agentArgs,
      sessionOptions: args.sessionOptions,
      allowEmptyPromptLaunch: true
    })
    delivery = 'paste-submit'
  } else if (args.promptDelivery === 'draft') {
    const draftLaunchPlan = buildAgentDraftLaunchPlan({
      agent,
      draft: trimmedInput,
      cmdOverrides,
      platform,
      shell,
      isRemote,
      agentArgs: args.agentArgs,
      sessionOptions: args.sessionOptions
    })
    if (draftLaunchPlan) {
      startupPlan = {
        agent: draftLaunchPlan.agent,
        launchCommand: draftLaunchPlan.launchCommand,
        expectedProcess: draftLaunchPlan.expectedProcess,
        followupPrompt: null,
        launchConfig: draftLaunchPlan.launchConfig,
        ...(draftLaunchPlan.sessionOptions
          ? { sessionOptions: draftLaunchPlan.sessionOptions }
          : {}),
        ...(draftLaunchPlan.startupCommandDelivery
          ? { startupCommandDelivery: draftLaunchPlan.startupCommandDelivery }
          : {}),
        ...(draftLaunchPlan.env ? { env: draftLaunchPlan.env } : {})
      }
      delivery = 'draft-native'
    } else {
      startupPlan = buildAgentStartupPlan({
        agent,
        prompt: '',
        cmdOverrides,
        platform,
        shell,
        isRemote,
        agentArgs: args.agentArgs,
        sessionOptions: args.sessionOptions,
        allowEmptyPromptLaunch: true
      })
      delivery = 'draft-paste'
    }
  } else if (TUI_AGENT_CONFIG[agent].promptInjectionMode === 'stdin-after-start') {
    startupPlan = buildAgentStartupPlan({
      agent,
      prompt: '',
      cmdOverrides,
      platform,
      shell,
      isRemote,
      agentArgs: args.agentArgs,
      sessionOptions: args.sessionOptions,
      allowEmptyPromptLaunch: true
    })
    delivery = 'draft-paste'
  } else {
    startupPlan = buildAgentStartupPlan({
      agent,
      prompt: trimmedInput,
      cmdOverrides,
      platform,
      shell,
      isRemote,
      agentArgs: args.agentArgs,
      sessionOptions: args.sessionOptions,
      allowEmptyPromptLaunch: false
    })
    delivery = 'argv'
  }

  if (!startupPlan) {
    return {
      ok: false,
      error: translate(
        'auto.lib.source.control.agent.action.plan.3f0ea9aa0d',
        'Could not build the agent launch command.'
      )
    }
  }

  const summary =
    delivery === 'paste-submit'
      ? 'The agent starts with no prompt, then Yiru pastes and submits the command input after the TUI is ready.'
      : delivery === 'draft-native'
        ? 'The command input is prefilled as an editable draft by the agent launch command.'
        : delivery === 'draft-paste'
          ? 'The agent starts with no prompt, then Yiru pastes the command input as an editable draft after the TUI is ready.'
          : 'The command input is included in the launch command and submitted as the first turn.'

  return {
    ok: true,
    plan: startupPlan,
    delivery,
    commandLabel: startupPlan.launchCommand,
    summary,
    caveat:
      'This check builds Yiru’s launch plan only. PATH, binary availability, account setup, and terminal startup failures are still caught by the real launch watchdog.'
  }
}
