import type { CommitMessageModel, ThinkingLevel } from './types'

export const BASIC_THINKING_LEVELS: ThinkingLevel[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' }
]

export const OPENAI_THINKING_LEVELS: ThinkingLevel[] = [
  ...BASIC_THINKING_LEVELS,
  { id: 'xhigh', label: 'Extra High' }
]

export const CLAUDE_THINKING_LEVELS: ThinkingLevel[] = [
  ...OPENAI_THINKING_LEVELS,
  { id: 'max', label: 'Max' }
]

export function labelFromModelId(id: string): string {
  return id
    .split(/[/-]/)
    .filter(Boolean)
    .map((part) => {
      if (/^gpt$/i.test(part)) {
        return 'GPT'
      }
      return part.length <= 3 && /^\d/.test(part)
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
}

export function withOpenAiThinking(
  id: string
): Pick<CommitMessageModel, 'thinkingLevels' | 'defaultThinkingLevel'> {
  return /(?:gpt-5|codex)/i.test(id)
    ? { thinkingLevels: OPENAI_THINKING_LEVELS, defaultThinkingLevel: 'low' }
    : {}
}
