import type { TuiAgent } from '../../agent/types'
import { CLAUDE_CODEX_COMMIT_MESSAGE_SPECS } from './claude-codex'
import { COPILOT_COMMIT_MESSAGE_SPECS } from './copilot'
import { OTHER_COMMIT_MESSAGE_AGENT_SPECS } from './other-providers'
import type { CommitMessageAgentSpec } from './types'

export const COMMIT_MESSAGE_AGENT_SPECS: Partial<Record<TuiAgent, CommitMessageAgentSpec>> = {
  claude: CLAUDE_CODEX_COMMIT_MESSAGE_SPECS.claude,
  codex: CLAUDE_CODEX_COMMIT_MESSAGE_SPECS.codex,
  opencode: OTHER_COMMIT_MESSAGE_AGENT_SPECS.opencode,
  pi: OTHER_COMMIT_MESSAGE_AGENT_SPECS.pi,
  amp: OTHER_COMMIT_MESSAGE_AGENT_SPECS.amp,
  cursor: OTHER_COMMIT_MESSAGE_AGENT_SPECS.cursor,
  kimi: OTHER_COMMIT_MESSAGE_AGENT_SPECS.kimi,
  copilot: COPILOT_COMMIT_MESSAGE_SPECS.copilot,
  antigravity: OTHER_COMMIT_MESSAGE_AGENT_SPECS.antigravity
}

export function getCommitMessageAgentSpec(agentId: TuiAgent): CommitMessageAgentSpec | undefined {
  return COMMIT_MESSAGE_AGENT_SPECS[agentId]
}
