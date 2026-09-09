import type { TuiAgent } from './types.js'

export const DEFAULT_TUI_AGENT_ARGS: Partial<Record<TuiAgent, string>> = {
  aider: '--yes-always',
  amp: '--dangerously-allow-all',
  ante: '--yolo',
  antigravity: '--dangerously-skip-permissions',
  autohand: '--unrestricted',
  claude: '--dangerously-skip-permissions',
  cline: '--auto-approve true',
  codex: '--dangerously-bypass-approvals-and-sandbox',
  'command-code': '--yolo',
  continue: '--allow "*"',
  copilot: '--yolo',
  crush: '--yolo',
  cursor: '--yolo',
  devin: '--permission-mode bypass',
  gemini: '--yolo',
  grok: '--permission-mode bypassPermissions',
  hermes: '--yolo',
  kimi: '--yolo',
  kiro: '--trust-all-tools',
  'mistral-vibe': '--agent auto-approve',
  openclaude: '--dangerously-skip-permissions',
  'qwen-code': '--approval-mode yolo',
  rovo: '--yolo',
  trae: '--yolo'
}

export const DEFAULT_TUI_AGENT_ENV: Partial<Record<TuiAgent, Record<string, string>>> = {
  goose: { GOOSE_MODE: 'auto' }
}

export function resolveTuiAgentLaunchArgs(
  agent: TuiAgent,
  configuredArgs: Partial<Record<TuiAgent, string>> | null | undefined
): string {
  if (
    configuredArgs &&
    Object.prototype.hasOwnProperty.call(configuredArgs, agent) &&
    typeof configuredArgs[agent] === 'string'
  ) {
    return configuredArgs[agent] ?? ''
  }
  return DEFAULT_TUI_AGENT_ARGS[agent] ?? ''
}

export function resolveTuiAgentLaunchEnv(
  agent: TuiAgent,
  configuredEnv: Partial<Record<TuiAgent, Record<string, string>>> | null | undefined
): Record<string, string> {
  if (configuredEnv && Object.prototype.hasOwnProperty.call(configuredEnv, agent)) {
    return { ...configuredEnv[agent] }
  }
  return { ...DEFAULT_TUI_AGENT_ENV[agent] }
}
