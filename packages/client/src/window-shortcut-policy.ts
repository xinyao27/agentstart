import {
  keybindingMatchesAction,
  type KeybindingMatchOptions,
  type KeybindingOverrides,
  type PhysicalModifierToken
} from '@agentstart/protocol/keybindings'

export type WindowShortcutInput = {
  type?: string
  key?: string
  code?: string
  alt?: boolean
  meta?: boolean
  control?: boolean
  shift?: boolean
  altKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  // Set only by the double-tap detector; threads the synthetic input through
  // the main-process resolver so allowlisted actions can fire on double-tap.
  doubleTapModifier?: PhysicalModifierToken
}

type WindowShortcutResolveOptions = KeybindingMatchOptions

export function matchesRecentTabSwitcherChord(
  input: WindowShortcutInput,
  platform: NodeJS.Platform,
  keybindings?: KeybindingOverrides,
  options: WindowShortcutResolveOptions = {}
): boolean {
  const control = Boolean(input.control ?? input.ctrlKey)
  const meta = Boolean(input.meta ?? input.metaKey)
  const alt = Boolean(input.alt ?? input.altKey)
  if (input.code !== 'Tab' || !control || meta || alt) {
    return false
  }
  // Why: the Ctrl+Tab switcher is a held-key interaction where Shift reverses
  // direction. Gate the whole family on the configurable unshifted binding.
  return keybindingMatchesAction(
    'tab.previousRecent',
    {
      key: input.key,
      code: input.code,
      alt,
      meta,
      control,
      shift: false,
      altKey: alt,
      metaKey: meta,
      ctrlKey: control,
      shiftKey: false
    },
    platform,
    keybindings,
    options
  )
}

function isControlKey(input: WindowShortcutInput): boolean {
  return (
    input.code === 'ControlLeft' ||
    input.code === 'ControlRight' ||
    input.code === 'Control' ||
    input.key === 'Control'
  )
}

function isTabKey(input: WindowShortcutInput): boolean {
  return input.code === 'Tab' || input.key === 'Tab'
}

export function isRecentTabSwitcherCommitRelease(input: WindowShortcutInput): boolean {
  if (input.type !== 'keyUp' && input.type !== 'keyup') {
    return false
  }
  if (isControlKey(input)) {
    return true
  }
  const control = input.control ?? input.ctrlKey
  // Why: some browser surfaces report the final Ctrl+Tab release as Tab
  // keyup after Control is already up, so commit instead of stranding the UI.
  return isTabKey(input) && control === false
}
