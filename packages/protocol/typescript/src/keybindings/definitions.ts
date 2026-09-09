import { ALL_TUI_AGENTS, TUI_AGENT_DISPLAY_NAMES } from '../agent/display-names.js'
import type { TuiAgent } from '../agent/types.js'
import { KEYBINDING_DEFINITIONS_1 } from './definition-1.js'
import { KEYBINDING_DEFINITIONS_2 } from './definition-2.js'
import { KEYBINDING_DEFINITIONS_3 } from './definition-3.js'
import { KEYBINDING_DEFINITIONS_4 } from './definition-4.js'
import type { AgentTabActionId, KeybindingActionId, KeybindingDefinition } from './model.js'
import { platformBindings } from './platform.js'

export const KEYBINDING_DEFINITIONS: readonly KeybindingDefinition[] = [
  ...KEYBINDING_DEFINITIONS_1,
  ...KEYBINDING_DEFINITIONS_2,
  ...KEYBINDING_DEFINITIONS_3,
  ...KEYBINDING_DEFINITIONS_4,
  ...buildAgentTabKeybindingDefinitions()
]

export function agentTabActionId(agent: TuiAgent): AgentTabActionId {
  return `tab.newAgent.${agent}`
}

// Why: one bindable action per agent so users can put each enabled agent on
// its own chord. All ship unassigned — `tab.newAgent` covers the default
// agent — and Settings → Shortcuts hides rows for disabled agents.
function buildAgentTabKeybindingDefinitions(): KeybindingDefinition[] {
  return ALL_TUI_AGENTS.map((agent) => ({
    id: agentTabActionId(agent),
    title: `New ${TUI_AGENT_DISPLAY_NAMES[agent]} tab`,
    group: 'Agents',
    scope: 'tabs',
    searchKeywords: [
      'shortcut',
      'tab',
      'agent',
      'new',
      'launch',
      agent,
      TUI_AGENT_DISPLAY_NAMES[agent].toLowerCase()
    ],
    defaultBindings: platformBindings([])
  }))
}

export const DEFINITIONS_BY_ID = new Map<KeybindingActionId, KeybindingDefinition>(
  KEYBINDING_DEFINITIONS.map((definition) => [definition.id, definition])
)

export const DEFINITION_IDS = new Set<KeybindingActionId>(
  KEYBINDING_DEFINITIONS.map((definition) => definition.id)
)

// Why: "Select Tab 1-9" / "Select Workspace 1-9" are single remappable rows
// whose chord is a representative — the digit is canonicalized to 1, but the
// binding fires for any of 1-9. These ids opt into that range behavior.
export const DIGIT_INDEX_ACTION_IDS: readonly KeybindingActionId[] = [
  'tab.selectByIndex',
  'workspace.selectByIndex'
]

export const DIGIT_INDEX_ACTION_ID_SET = new Set<KeybindingActionId>(DIGIT_INDEX_ACTION_IDS)

// The representative key for a digit-index chord is a single 1-9 number key.
export const DIGIT_INDEX_KEY_PATTERN = /^[1-9]$/

export function isDigitIndexActionId(actionId: KeybindingActionId): boolean {
  return DIGIT_INDEX_ACTION_ID_SET.has(actionId)
}

export function isKeybindingActionId(value: string): value is KeybindingActionId {
  return DEFINITION_IDS.has(value as KeybindingActionId)
}

export function normalizeKeybindingActionId(value: string): KeybindingActionId | null {
  if (value === 'worktree.palette') {
    return 'app.commandPalette'
  }
  return isKeybindingActionId(value) ? value : null
}
