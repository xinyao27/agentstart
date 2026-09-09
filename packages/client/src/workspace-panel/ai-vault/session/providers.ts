import type { AiVaultAgent } from '@yiru/protocol/ai-vault/providers'

export type AiVaultScope = 'workspace' | 'project' | 'all'
export type AiVaultSort = 'updated' | 'created'
export type AiVaultGroup = 'project' | 'folder' | 'agent'

export const AI_VAULT_AGENT_LABELS = {
  claude: 'Claude',
  codex: 'Codex',
  hermes: 'Hermes',
  pi: 'Pi',
  omp: 'OMP',
  cursor: 'Cursor',
  gemini: 'Gemini',
  antigravity: 'Antigravity',
  rovo: 'Rovo Dev',
  copilot: 'GitHub Copilot',
  opencode: 'OpenCode',
  grok: 'Grok',
  openclaw: 'OpenClaw',
  devin: 'Devin',
  droid: 'Droid',
  kimi: 'Kimi'
} as const satisfies Record<AiVaultAgent, string>

export function aiVaultAgentLabel(agent: AiVaultAgent): string {
  return AI_VAULT_AGENT_LABELS[agent]
}
