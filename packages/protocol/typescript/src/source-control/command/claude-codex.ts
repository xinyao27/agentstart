import type { TuiAgent } from '../../agent/types'
import { CLAUDE_CODEX_COMMIT_MESSAGE_CAPABILITIES } from '../catalog/claude-codex'
import type { CommitMessageAgentSpec } from './types'
export const CLAUDE_CODEX_COMMIT_MESSAGE_SPECS: Partial<Record<TuiAgent, CommitMessageAgentSpec>> =
  {
    claude: {
      ...CLAUDE_CODEX_COMMIT_MESSAGE_CAPABILITIES.claude,
      binary: 'claude',
      promptDelivery: 'stdin',
      buildArgs: ({ model, thinkingLevel }) => [
        '-p',
        '--output-format',
        'text',
        '--model',
        model,
        '--permission-mode',
        'plan',
        ...(thinkingLevel ? ['--effort', thinkingLevel] : [])
      ]
    },
    codex: {
      ...CLAUDE_CODEX_COMMIT_MESSAGE_CAPABILITIES.codex,
      binary: 'codex',
      promptDelivery: 'stdin',
      buildArgs: ({ model, thinkingLevel }) => [
        'exec',
        '--ephemeral',
        '--skip-git-repo-check',
        '-s',
        'read-only',
        '--model',
        model,
        ...(thinkingLevel ? ['-c', `model_reasoning_effort=${thinkingLevel}`] : [])
      ]
    }
  }
