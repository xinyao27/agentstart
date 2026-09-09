import type { TuiAgent } from '../agent/types.js'

export const AI_VAULT_AGENTS = [
  'claude',
  'codex',
  'hermes',
  'pi',
  'omp',
  'cursor',
  'gemini',
  'antigravity',
  'rovo',
  'copilot',
  'opencode',
  'grok',
  'openclaw',
  'devin',
  'droid',
  'kimi'
] as const satisfies readonly TuiAgent[]

export type AiVaultAgent = (typeof AI_VAULT_AGENTS)[number]
