import type { TuiAgent } from '@agentstart/protocol/agent/types'
import {
  findKeybindingConflicts,
  formatKeybindingList,
  getEffectiveKeybindingsForAction,
  getKeybindingDefinition,
  type KeybindingActionId,
  type KeybindingOverrides,
  type TerminalShortcutPolicy
} from '@agentstart/protocol/keybindings'

import { hasOwnBindingOverride } from '../keybinding-override-edits'
import type { ShortcutRowsByGroup } from './filter-rail'
import { disabledAgentTabActionIds, groupDefinitions } from './groups'
import { getShortcutTerminalStatus } from './terminal-status'

/** Conflicts keyed per action id, worded for display under the shortcut rows. */
export function buildShortcutConflictByAction(
  platform: string,
  keybindings: KeybindingOverrides,
  ignoredConflictActionIds: readonly KeybindingActionId[]
): Map<KeybindingActionId, string[]> {
  const result = new Map<KeybindingActionId, string[]>()
  for (const conflict of findKeybindingConflicts(platform, keybindings, {
    ignoredActionIds: ignoredConflictActionIds
  })) {
    const labels = conflict.actionIds
      .map((id) => getKeybindingDefinition(id)?.title ?? id)
      .join(', ')
    for (const actionId of conflict.actionIds) {
      result.set(actionId, [
        ...(result.get(actionId) ?? []),
        `${formatKeybindingList([conflict.binding], platform)} conflicts with ${labels}.`
      ])
    }
  }
  return result
}

export function buildShortcutConflictIgnoredIds(
  disabledTuiAgents: readonly TuiAgent[]
): KeybindingActionId[] {
  return disabledAgentTabActionIds(disabledTuiAgents)
}

export function buildShortcutRowsByGroup(options: {
  disabledTuiAgents: readonly TuiAgent[]
  platform: string
  keybindings: KeybindingOverrides
  terminalShortcutPolicy: TerminalShortcutPolicy
  conflictByAction: Map<KeybindingActionId, string[]>
}): ShortcutRowsByGroup[] {
  const { disabledTuiAgents, platform, keybindings, terminalShortcutPolicy, conflictByAction } =
    options
  return groupDefinitions(disabledTuiAgents).map((group) => ({
    title: group.title,
    rows: group.items.map((item) => {
      const effective = getEffectiveKeybindingsForAction(item.id, platform, keybindings)
      const modified = hasOwnBindingOverride(keybindings, item.id)
      const warnings = conflictByAction.get(item.id) ?? []
      return {
        item,
        groupTitle: group.title,
        effective,
        modified,
        warnings,
        terminalStatus: getShortcutTerminalStatus(
          item,
          terminalShortcutPolicy,
          effective.length > 0
        )
      }
    })
  }))
}
