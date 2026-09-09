import type { TuiAgent } from '../../agent/types'
import { BASIC_THINKING_LEVELS, withOpenAiThinking } from './model-metadata'
import type { CommitMessageAgentCapability } from './types'

export const OTHER_COMMIT_MESSAGE_AGENT_CAPABILITIES = {
  opencode: {
    id: 'opencode',
    label: 'OpenCode',
    modelSource: 'dynamic',
    models: [
      {
        id: 'opencode/deepseek-v4-flash-free',
        label: 'OpenCode DeepSeek V4 Flash Free'
      },
      {
        id: 'opencode/gpt-5.4-mini',
        label: 'OpenCode GPT 5.4 Mini',
        ...withOpenAiThinking('gpt-5.4-mini')
      }
    ],
    defaultModelId: 'opencode/deepseek-v4-flash-free'
  },
  pi: {
    id: 'pi',
    label: 'Pi',
    modelSource: 'dynamic',
    models: [
      {
        id: 'github-copilot/gpt-5.4-mini',
        label: 'Github Copilot GPT 5.4 Mini',
        ...withOpenAiThinking('gpt-5.4-mini')
      }
    ],
    defaultModelId: 'github-copilot/gpt-5.4-mini'
  },
  amp: {
    id: 'amp',
    label: 'Amp',
    modelSource: 'static',
    models: [
      { id: 'smart', label: 'Smart' },
      { id: 'rush', label: 'Rush' },
      {
        id: 'large',
        label: 'Large',
        thinkingLevels: BASIC_THINKING_LEVELS,
        defaultThinkingLevel: 'low'
      },
      {
        id: 'deep',
        label: 'Deep',
        thinkingLevels: BASIC_THINKING_LEVELS,
        defaultThinkingLevel: 'low'
      }
    ],
    defaultModelId: 'smart'
  },
  cursor: {
    id: 'cursor',
    label: 'Cursor',
    modelSource: 'dynamic',
    models: [{ id: 'auto', label: 'Auto' }],
    defaultModelId: 'auto'
  },
  kimi: {
    id: 'kimi',
    label: 'Kimi',
    modelSource: 'static',
    models: [
      { id: 'default', label: 'Config default' },
      {
        id: 'kimi-code/kimi-for-coding',
        label: 'Kimi K2.6',
        thinkingLevels: [
          { id: 'on', label: 'On' },
          { id: 'off', label: 'Off' }
        ],
        defaultThinkingLevel: 'on'
      }
    ],
    defaultModelId: 'default'
  },
  antigravity: {
    id: 'antigravity',
    label: 'Antigravity',
    modelSource: 'dynamic',
    models: [
      { id: 'Gemini 3.5 Flash (Medium)', label: 'Gemini 3.5 Flash (Medium)' },
      { id: 'Gemini 3.5 Flash (High)', label: 'Gemini 3.5 Flash (High)' },
      { id: 'Gemini 3.5 Flash (Low)', label: 'Gemini 3.5 Flash (Low)' }
    ],
    defaultModelId: 'Gemini 3.5 Flash (Medium)'
  }
} satisfies Partial<Record<TuiAgent, CommitMessageAgentCapability>>
