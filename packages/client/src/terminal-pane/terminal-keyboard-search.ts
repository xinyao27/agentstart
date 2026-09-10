import {
  keybindingMatchesAction,
  type KeybindingOverrides,
  type KeybindingPlatform,
  type TerminalShortcutPolicy
} from '@agentstart/protocol/keybindings'
import { isFindQueryTooLarge } from '~renderer/search/query-bounds'
import type { ManagedPane } from '~renderer/terminal-pane/pane-manager/pane-manager'

import { safeFind } from './search/safe-find'

export type SearchState = {
  query: string
  caseSensitive: boolean
  regex: boolean
}

export type SearchNavigationDirection = 'next' | 'previous'

export function isEditableTerminalKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  // Why: xterm's helper textarea is editable DOM but represents terminal
  // focus, where terminal shortcuts must remain active.
  if (target.classList.contains('xterm-helper-textarea')) {
    return false
  }
  return (
    target.isContentEditable ||
    target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !==
      null
  )
}

export function matchSearchNavigate(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
  isMac: boolean,
  searchOpen: boolean,
  searchState: SearchState
): SearchNavigationDirection | null {
  if (event.altKey) {
    return null
  }
  const modifier = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  if (
    !modifier ||
    event.key.toLowerCase() !== 'g' ||
    !searchOpen ||
    !searchState.query ||
    isFindQueryTooLarge(searchState.query)
  ) {
    return null
  }
  return event.shiftKey ? 'previous' : 'next'
}

export function runTerminalSearchNavigation(
  pane: Pick<ManagedPane, 'searchAddon'>,
  direction: SearchNavigationDirection,
  searchState: SearchState
): boolean {
  const { query, caseSensitive, regex } = searchState
  const options = { caseSensitive, regex }
  // Why: keyboard navigation reaches the same xterm decoration path as the
  // search panel, so narrow-viewport failures need the same containment.
  return direction === 'next'
    ? safeFind((term, findOptions) => pane.searchAddon.findNext(term, findOptions), query, options)
    : safeFind(
        (term, findOptions) => pane.searchAddon.findPrevious(term, findOptions),
        query,
        options
      )
}

export function matchFileSearchShortcut(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'repeat'>,
  platform: KeybindingPlatform,
  keybindings?: KeybindingOverrides,
  terminalShortcutPolicy: TerminalShortcutPolicy = 'agentstart-first'
): boolean {
  return (
    !event.repeat &&
    keybindingMatchesAction('sidebar.search.toggle', event, platform, keybindings, {
      context: 'terminal',
      terminalShortcutPolicy
    })
  )
}
