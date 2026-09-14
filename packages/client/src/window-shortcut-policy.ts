import {
  getEffectiveKeybindingsForAction,
  keybindingMatchesAction,
  parseKeybinding,
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

// The physical shape of the held-key tab switcher chord. It is resolved from
// the tab.previousRecent binding instead of a hardcoded Ctrl+Tab because the
// browser reserves Ctrl+Tab and the page never sees it.
type RecentTabSwitcherChord = {
  code: string
  meta: boolean
  control: boolean
  alt: boolean
}

function physicalCodeForChordKey(key: string): string {
  if (key.length === 1 && /[a-z]/i.test(key)) {
    return `Key${key.toUpperCase()}`
  }
  if (key.length === 1 && /[0-9]/.test(key)) {
    return `Digit${key}`
  }
  return key
}

function resolveRecentTabSwitcherChord(
  platform: NodeJS.Platform,
  keybindings?: KeybindingOverrides
): RecentTabSwitcherChord | null {
  for (const binding of getEffectiveKeybindingsForAction(
    'tab.previousRecent',
    platform,
    keybindings
  )) {
    const parsed = parseKeybinding(binding)
    if (!parsed || parsed.doubleTapModifier) {
      continue
    }
    const isMac = platform === 'darwin'
    return {
      code: physicalCodeForChordKey(parsed.key),
      meta: parsed.meta || (parsed.mod && isMac),
      control: parsed.control || (parsed.mod && !isMac),
      alt: parsed.alt
    }
  }
  return null
}

function inputModifierState(input: WindowShortcutInput): {
  meta: boolean
  control: boolean
  alt: boolean
} {
  return {
    meta: Boolean(input.meta ?? input.metaKey),
    control: Boolean(input.control ?? input.ctrlKey),
    alt: Boolean(input.alt ?? input.altKey)
  }
}

function isTabKey(input: WindowShortcutInput): boolean {
  return input.code === 'Tab' || input.key === 'Tab'
}

function releasedChordModifier(input: WindowShortcutInput): 'meta' | 'control' | 'alt' | null {
  const token = input.code ?? input.key ?? ''
  if (token.startsWith('Meta') || input.key === 'Meta') {
    return 'meta'
  }
  if (token.startsWith('Control') || input.key === 'Control') {
    return 'control'
  }
  if (token.startsWith('Alt') || input.key === 'Alt') {
    return 'alt'
  }
  return null
}

export function matchesRecentTabSwitcherChord(
  input: WindowShortcutInput,
  platform: NodeJS.Platform,
  keybindings?: KeybindingOverrides,
  options: WindowShortcutResolveOptions = {}
): boolean {
  const chord = resolveRecentTabSwitcherChord(platform, keybindings)
  if (!chord) {
    return false
  }
  const { meta, control, alt } = inputModifierState(input)
  // Why: the switcher is a held-key interaction where Shift reverses
  // direction, so the physical gate matches the chord with Shift ignored and
  // the registry match runs unshifted.
  if (
    input.code !== chord.code ||
    meta !== chord.meta ||
    control !== chord.control ||
    alt !== chord.alt
  ) {
    return false
  }
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

export function isRecentTabSwitcherCommitRelease(
  input: WindowShortcutInput,
  platform: NodeJS.Platform,
  keybindings?: KeybindingOverrides
): boolean {
  if (input.type !== 'keyUp' && input.type !== 'keyup') {
    return false
  }
  const chord = resolveRecentTabSwitcherChord(platform, keybindings)
  if (!chord) {
    return false
  }
  const { meta, control, alt } = inputModifierState(input)
  const heldChordModifiers =
    (chord.meta && meta ? 1 : 0) + (chord.control && control ? 1 : 0) + (chord.alt && alt ? 1 : 0)
  if (input.code === chord.code || isTabKey(input)) {
    // Why: some browser surfaces report the final chord release as the tap
    // key's keyup after the modifiers are already up, so commit instead of
    // stranding the UI.
    return heldChordModifiers === 0
  }
  const released = releasedChordModifier(input)
  if (released === null || !chord[released]) {
    return false
  }
  // Commit once every chord modifier (Shift excluded — it only reverses
  // direction) has been released.
  return heldChordModifiers === 0
}
