import type { TuiAgent } from '../../agent/types'
import { CLAUDE_THINKING_LEVELS, OPENAI_THINKING_LEVELS } from './model-metadata'
import type { CommitMessageAgentCapability } from './types'

export const CLAUDE_CODEX_COMMIT_MESSAGE_CAPABILITIES = {
  claude: {
    id: 'claude',
    label: 'Claude',
    modelSource: 'static',
    models: [
      { id: 'haiku', label: 'Haiku' },
      {
        id: 'sonnet',
        label: 'Sonnet',
        thinkingLevels: CLAUDE_THINKING_LEVELS,
        defaultThinkingLevel: 'low'
      },
      {
        id: 'opus',
        label: 'Opus',
        thinkingLevels: CLAUDE_THINKING_LEVELS,
        defaultThinkingLevel: 'low'
      }
    ],
    defaultModelId: 'sonnet'
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    modelSource: 'dynamic',
    models: [
      {
        id: 'gpt-5.5',
        label: 'GPT-5.5',
        thinkingLevels: OPENAI_THINKING_LEVELS,
        defaultThinkingLevel: 'low'
      },
      {
        id: 'gpt-5.4',
        label: 'GPT-5.4',
        thinkingLevels: OPENAI_THINKING_LEVELS,
        defaultThinkingLevel: 'low'
      },
      {
        id: 'gpt-5.4-mini',
        label: 'GPT-5.4 Mini',
        thinkingLevels: OPENAI_THINKING_LEVELS,
        defaultThinkingLevel: 'low'
      },
      {
        id: 'gpt-5.3-codex',
        label: 'GPT-5.3 Codex',
        thinkingLevels: OPENAI_THINKING_LEVELS,
        defaultThinkingLevel: 'low'
      },
      {
        id: 'gpt-5.3-codex-spark',
        label: 'GPT-5.3 Codex Spark',
        thinkingLevels: OPENAI_THINKING_LEVELS,
        defaultThinkingLevel: 'low'
      },
      {
        id: 'gpt-5.2',
        label: 'GPT-5.2',
        thinkingLevels: OPENAI_THINKING_LEVELS,
        defaultThinkingLevel: 'low'
      }
    ],
    defaultModelId: 'gpt-5.5'
  }
} satisfies Partial<Record<TuiAgent, CommitMessageAgentCapability>>
