import type { AgentSessionOptionCatalog, CatalogOption } from './catalog-types'
import type { SessionOptionSelectChoice } from './types'

function hasModelFlag(tokens: readonly string[]): boolean {
  return tokens.some(
    (token) =>
      token === '-m' ||
      token === '--model' ||
      token.startsWith('-m=') ||
      (token.startsWith('-m') && !token.startsWith('--')) ||
      token.startsWith('--model=')
  )
}

export const GEMINI_SESSION_OPTION_CATALOG: AgentSessionOptionCatalog = {
  models: [
    { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview', options: [] },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', options: [] },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', options: [] },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', options: [] }
  ],
  modelApply: {
    launchArgs: (value) => ['-m', String(value)],
    agentArgsOverride: hasModelFlag,
    midSession: { kind: 'agent-picker', command: '/model' }
  }
}

const CURSOR_STANDARD_EFFORT_CHOICES: SessionOptionSelectChoice[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' }
]

const CURSOR_EXTENDED_EFFORT_CHOICES: SessionOptionSelectChoice[] = [
  ...CURSOR_STANDARD_EFFORT_CHOICES,
  { value: 'xhigh', label: 'Extra high' }
]

const CURSOR_MAX_EFFORT_CHOICES: SessionOptionSelectChoice[] = [
  ...CURSOR_EXTENDED_EFFORT_CHOICES,
  { value: 'max', label: 'Max' }
]

const CURSOR_OPENAI_EFFORT_CHOICES: SessionOptionSelectChoice[] = [
  { value: 'none', label: 'None' },
  ...CURSOR_MAX_EFFORT_CHOICES
]

const CURSOR_MINIMAL_EFFORT_CHOICES: SessionOptionSelectChoice[] = [
  { value: 'minimal', label: 'Minimal' },
  ...CURSOR_STANDARD_EFFORT_CHOICES
]

function cursorEffort(
  choices: readonly SessionOptionSelectChoice[],
  defaultValue: string
): CatalogOption {
  return {
    id: 'effort',
    label: 'Effort',
    category: 'thought_level',
    kind: { type: 'select', choices: [...choices], defaultValue },
    apply: { composedIntoModel: true }
  }
}

const CURSOR_FAST: CatalogOption = {
  id: 'fastMode',
  label: 'Fast mode',
  category: 'mode',
  kind: { type: 'boolean', defaultValue: false },
  apply: { composedIntoModel: true }
}

export const CURSOR_SESSION_OPTION_CATALOG: AgentSessionOptionCatalog = {
  models: [
    { id: 'auto', label: 'Auto', isDefault: true, options: [] },
    {
      id: 'gpt-5.6-sol',
      label: 'GPT-5.6 Sol',
      options: [cursorEffort(CURSOR_OPENAI_EFFORT_CHOICES, 'medium'), CURSOR_FAST]
    },
    {
      id: 'gpt-5.6-terra',
      label: 'GPT-5.6 Terra',
      options: [cursorEffort(CURSOR_OPENAI_EFFORT_CHOICES, 'medium'), CURSOR_FAST]
    },
    {
      id: 'gpt-5.6-luna',
      label: 'GPT-5.6 Luna',
      options: [cursorEffort(CURSOR_OPENAI_EFFORT_CHOICES, 'medium'), CURSOR_FAST]
    },
    {
      id: 'gpt-5.3-codex',
      label: 'GPT-5.3 Codex',
      options: [cursorEffort(CURSOR_EXTENDED_EFFORT_CHOICES, 'medium'), CURSOR_FAST]
    },
    {
      id: 'claude-fable-5-thinking',
      label: 'Claude Fable 5 Thinking',
      options: [cursorEffort(CURSOR_MAX_EFFORT_CHOICES, 'high')]
    },
    {
      id: 'claude-opus-5-thinking',
      label: 'Claude Opus 5 Thinking',
      options: [cursorEffort(CURSOR_MAX_EFFORT_CHOICES, 'high'), CURSOR_FAST]
    },
    {
      id: 'claude-sonnet-5-thinking',
      label: 'Claude Sonnet 5 Thinking',
      options: [cursorEffort(CURSOR_MAX_EFFORT_CHOICES, 'high')]
    },
    {
      id: 'cursor-grok-4.6',
      label: 'Cursor Grok 4.6',
      options: [cursorEffort(CURSOR_EXTENDED_EFFORT_CHOICES, 'high'), CURSOR_FAST]
    },
    {
      id: 'gemini-3.7-flash',
      label: 'Gemini 3.7 Flash',
      options: [cursorEffort(CURSOR_STANDARD_EFFORT_CHOICES, 'high')]
    },
    {
      id: 'gemini-3.6-flash',
      label: 'Gemini 3.6 Flash',
      options: [cursorEffort(CURSOR_MINIMAL_EFFORT_CHOICES, 'high')]
    },
    {
      id: 'composer-2.5',
      label: 'Composer 2.5',
      options: [CURSOR_FAST]
    }
  ],
  modelApply: {
    launchArgs: (value) => ['--model', String(value)],
    agentArgsOverride: hasModelFlag,
    midSession: { kind: 'command', build: (value) => `/model ${String(value)}` }
  },
  composeModelValue: (modelId, values) => {
    if (modelId === 'auto') {
      return modelId
    }
    const effortValue = typeof values.effort === 'string' ? values.effort : null
    // Why: Cursor's catalog names medium GPT-5.3 Codex without an effort suffix.
    const effort =
      effortValue && !(modelId === 'gpt-5.3-codex' && effortValue === 'medium')
        ? `-${effortValue}`
        : ''
    const fast = values.fastMode === true ? '-fast' : ''
    return `${modelId}${effort}${fast}`
  }
}
