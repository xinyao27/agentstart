import { resolveAgentSessionOptionLaunch } from '../session-options/launch'
import type { SessionOptionValue } from '../session-options/types'
import type { StartupHostPlatform } from '../shell-command'
import {
  planAgentCliArgsSuffix,
  quoteStartupArg,
  tokenizeStartupCommand,
  type AgentStartupShell
} from '../shell-command'
import type { TuiAgent } from '../types'
import { getTuiAgentLaunchCommand, TUI_AGENT_CONFIG } from './config'

export type ResolvedAgentLaunchCommand =
  | {
      ok: true
      command: string
      commandWithoutSessionOptions: string
      appliedSessionOptions: Record<string, SessionOptionValue>
    }
  | { ok: false; error: string }

export function resolveAgentLaunchCommand(args: {
  agent: TuiAgent
  cmdOverrides: Partial<Record<TuiAgent, string>>
  platform: StartupHostPlatform
  shell: AgentStartupShell
  agentArgs?: string | null
  sessionOptions?: Record<string, SessionOptionValue>
  isRemote?: boolean
}): ResolvedAgentLaunchCommand {
  const override = args.cmdOverrides[args.agent]
  const command =
    override ||
    getTuiAgentLaunchCommand(TUI_AGENT_CONFIG[args.agent], args.platform, {
      isRemote: args.isRemote
    })
  const suffix = planAgentCliArgsSuffix(args.agentArgs, args.shell)
  if (!suffix.ok) {
    return suffix
  }
  const trailingTokens = args.agentArgs?.trim()
    ? tokenizeStartupCommand(args.agentArgs.trim(), args.shell)
    : { ok: true as const, tokens: [] }
  if (!trailingTokens.ok) {
    return { ok: false, error: trailingTokens.error }
  }
  const resolvedOptions = resolveAgentSessionOptionLaunch(
    args.agent,
    args.sessionOptions,
    trailingTokens.tokens
  )
  const optionSuffix = resolvedOptions.args.map((arg) => quoteStartupArg(arg, args.shell)).join(' ')
  const commandWithOptions = optionSuffix ? `${command} ${optionSuffix}` : command
  const commandWithoutSessionOptions = suffix.suffix ? `${command} ${suffix.suffix}` : command
  // Why: session flags precede the free-form suffix so the user's explicit
  // repeated flag remains the final, winning occurrence.
  return {
    ok: true,
    command: suffix.suffix ? `${commandWithOptions} ${suffix.suffix}` : commandWithOptions,
    commandWithoutSessionOptions,
    appliedSessionOptions: resolvedOptions.appliedValues
  }
}
