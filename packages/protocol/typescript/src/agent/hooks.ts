export const AGENT_HOOK_TARGETS = [
  'claude',
  'openclaude',
  'codex',
  'gemini',
  'antigravity',
  'amp',
  'cursor',
  'droid',
  'command-code',
  'grok',
  'copilot',
  'hermes',
  'devin',
  'kimi'
] as const
export type AgentHookTarget = (typeof AGENT_HOOK_TARGETS)[number]

export type AgentHookInstallState = 'installed' | 'not_installed' | 'partial' | 'error'

export type AgentHookInstallStatus = {
  agent: AgentHookTarget
  state: AgentHookInstallState
  configPath: string
  managedHooksPresent: boolean
  detail: string | null
}

// Why: bumped whenever the managed script's request shape changes. The
// receiver logs a warning when it sees a request from a different version so a
// stale script installed by an older app build is diagnosable instead of
// silently producing partial payloads. Still at v1 because the endpoint-file
// rollout is additive — pre-endpoint-file scripts still post the same JSON
// body shape, and no in-wild v1 script exists that a future v2 receiver would
// need to distinguish from: Claude/Codex/Gemini installs run for everyone on
// first launch but no v1 fleet ever shipped, and Cursor's managed script is
// rewritten on every install() call so there is no durable on-disk v1 script
// to inherit. Reserve the next bump for a real wire change.
export const YIRU_HOOK_PROTOCOL_VERSION = '1' as const
