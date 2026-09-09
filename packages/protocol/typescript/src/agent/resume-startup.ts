import {
  getAgentResumeArgv,
  type AgentProviderSessionMetadata,
  type ResumableTuiAgent,
  type SleepingAgentLaunchConfig
} from './session-resume.js'
import type { StartupHostPlatform } from './shell-command.js'
import {
  planAgentCliArgsSuffix,
  quoteStartupArg,
  resolveStartupShell,
  type AgentStartupShell
} from './shell-command.js'
import type { TuiAgent } from './types.js'

type ResumableAgentRuntime = {
  launchCommand: string
  expectedProcess: string
}

const RESUMABLE_AGENT_RUNTIME: Record<ResumableTuiAgent, ResumableAgentRuntime> = {
  claude: { launchCommand: 'claude', expectedProcess: 'claude' },
  codex: { launchCommand: 'codex', expectedProcess: 'codex' },
  gemini: { launchCommand: 'gemini', expectedProcess: 'gemini' },
  antigravity: { launchCommand: 'agy', expectedProcess: 'agy' },
  opencode: { launchCommand: 'opencode', expectedProcess: 'opencode' },
  'mimo-code': { launchCommand: 'mimo', expectedProcess: 'mimo' },
  droid: { launchCommand: 'droid', expectedProcess: 'droid' },
  grok: { launchCommand: 'grok', expectedProcess: 'grok' },
  devin: { launchCommand: 'devin', expectedProcess: 'devin' },
  pi: { launchCommand: 'pi', expectedProcess: 'pi' },
  omp: { launchCommand: 'omp', expectedProcess: 'omp' }
}

export type AgentResumeStartupPlan = {
  agent: ResumableTuiAgent
  launchCommand: string
  expectedProcess: string
  followupPrompt: null
  launchConfig: SleepingAgentLaunchConfig
  env?: Record<string, string>
}

export function buildAgentResumeStartupPlan(args: {
  agent: ResumableTuiAgent
  providerSession: AgentProviderSessionMetadata
  cmdOverrides: Partial<Record<TuiAgent, string>>
  platform: StartupHostPlatform
  shell?: AgentStartupShell
  agentArgs?: string | null
  agentEnv?: Record<string, string> | null
  agentCommand?: string | null
  ompResumeFilePath?: string | null
}): AgentResumeStartupPlan | null {
  const resumeArgv = getAgentResumeArgv(args.agent, args.providerSession, args.ompResumeFilePath)
  if (!resumeArgv) {
    return null
  }

  const shell = resolveStartupShell(args.platform, args.shell)
  const runtime = RESUMABLE_AGENT_RUNTIME[args.agent]
  const persistedCommand = args.agentCommand?.trim()
  let baseCommand = persistedCommand || args.cmdOverrides[args.agent] || runtime.launchCommand

  // Why: a persisted command already contains its durable argument suffix;
  // fresh settings need shell-safe normalization before becoming resumable state.
  if (!persistedCommand) {
    const suffix = planAgentCliArgsSuffix(args.agentArgs, shell)
    if (!suffix.ok) {
      return null
    }
    if (suffix.suffix) {
      baseCommand = `${baseCommand} ${suffix.suffix}`
    }
  }

  const resumeArgs = resumeArgv
    .slice(1)
    .map((arg) => quoteStartupArg(arg, shell))
    .join(' ')
  const launchCommand = resumeArgs ? `${baseCommand} ${resumeArgs}` : baseCommand
  const launchConfig: SleepingAgentLaunchConfig = {
    ...(baseCommand.trim() ? { agentCommand: baseCommand } : {}),
    agentArgs: args.agentArgs ?? '',
    agentEnv: args.agentEnv ? { ...args.agentEnv } : {},
    ...(args.ompResumeFilePath?.trim() ? { ompResumeFilePath: args.ompResumeFilePath.trim() } : {})
  }

  return {
    agent: args.agent,
    launchCommand,
    expectedProcess: runtime.expectedProcess,
    followupPrompt: null,
    launchConfig,
    ...(args.agentEnv ? { env: { ...args.agentEnv } } : {})
  }
}
