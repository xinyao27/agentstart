import type { TuiAgent } from './types'

const AGENT_IDS = {
  claude: true,
  openclaude: true,
  codex: true,
  autohand: true,
  ante: true,
  trae: true,
  opencode: true,
  'mimo-code': true,
  pi: true,
  omp: true,
  gemini: true,
  antigravity: true,
  aider: true,
  goose: true,
  amp: true,
  kilo: true,
  kiro: true,
  crush: true,
  aug: true,
  cline: true,
  codebuff: true,
  'command-code': true,
  continue: true,
  cursor: true,
  droid: true,
  kimi: true,
  'mistral-vibe': true,
  'qwen-code': true,
  rovo: true,
  hermes: true,
  openclaw: true,
  copilot: true,
  grok: true,
  devin: true
} satisfies Record<TuiAgent, true>

export function isTuiAgent(value: unknown): value is TuiAgent {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(AGENT_IDS, value)
}
