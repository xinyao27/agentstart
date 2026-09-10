import { keybindingMatchesAction, type KeybindingActionId } from '@agentstart/protocol/keybindings'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { getShortcutPlatform } from '~renderer/keyboard-input/shortcut-platform'
import { useAppStore } from '~renderer/store/state'

export function editorShortcutMatches(
  actionId: KeybindingActionId,
  event: KeyboardEvent | ReactKeyboardEvent
): boolean {
  return keybindingMatchesAction(
    actionId,
    event,
    getShortcutPlatform(),
    useAppStore.getState().keybindings
  )
}
