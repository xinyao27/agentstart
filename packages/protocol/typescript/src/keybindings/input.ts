import { isDigitIndexActionId } from './definitions.js'
import type {
  KeybindingActionId,
  KeybindingInput,
  KeybindingValidationResult,
  ModifierToken,
  NormalizeKeybindingOptions,
  PhysicalModifierToken
} from './model.js'
import { canonicalizeDigitIndexBinding, normalizeOptionsForAction } from './normalization.js'
import { getKeybindingPlatform } from './platform.js'
import { hasModifier, normalizeKeybindingWithOptions, normalizeKeyToken } from './syntax.js'

const MODIFIER_KEYS = new Set([
  'Alt',
  'AltGraph',
  'Control',
  'Meta',
  'Shift',
  'OS',
  'Fn',
  'FnLock',
  'Hyper',
  'Super',
  'Symbol',
  'SymbolLock'
])

export const PUNCTUATION_KEY_TOKENS = new Set([
  'BracketLeft',
  'BracketRight',
  'Minus',
  'Underscore',
  'Equal',
  'Plus',
  'Comma',
  'Period',
  'Slash',
  'Backslash',
  'Semicolon',
  'Quote',
  'Backquote'
])

function isPunctuationKeyToken(token: string | null): token is string {
  return token !== null && PUNCTUATION_KEY_TOKENS.has(token)
}

const PHYSICAL_CODE_FALLBACK_KEYS = new Set(['', 'Dead', 'Unidentified'])

const SHIFTED_PUNCTUATION_KEY_TOKENS: Record<string, string> = {
  '<': 'Comma',
  '>': 'Period',
  '?': 'Slash',
  '|': 'Backslash',
  ':': 'Semicolon',
  '"': 'Quote',
  '~': 'Backquote'
}

export function logicalKeyTokenFromInput(input: KeybindingInput): string | null {
  const key = input.key ?? ''
  if (MODIFIER_KEYS.has(key)) {
    return null
  }
  const normalizedKey = normalizeKeyToken(key)
  if (normalizedKey) {
    return normalizedKey
  }
  if (hasModifier(input, 'shift')) {
    return SHIFTED_PUNCTUATION_KEY_TOKENS[key] ?? null
  }
  return null
}

export function canUsePhysicalCodeFallback(input: KeybindingInput): boolean {
  // Why: layout-aware shortcuts must trust real logical keys; physical code is
  // only a fallback when the platform cannot report the produced key.
  return PHYSICAL_CODE_FALLBACK_KEYS.has(input.key ?? '')
}

export function isLatinShortcutKey(key: string): boolean {
  // Why: A-Z / 0-9 are the only single chars a Latin shortcut token names; any
  // other produced character (Cyrillic с, Greek π, ...) cannot be a deliberate
  // remap of a Latin chord, so it is safe to fall back to the physical code.
  if (key.length !== 1) {
    return false
  }
  const upper = key.toUpperCase()
  return (upper >= 'A' && upper <= 'Z') || (key >= '0' && key <= '9')
}

export function shouldUseNonLatinShortcutPhysicalFallback(
  input: KeybindingInput,
  platform: string
): boolean {
  // Why: non-Latin layouts (Cyrillic, Greek, ...) report a non-Latin logical key
  // for physical letter keys (issue #6274), so Ctrl/Meta shortcuts never match.
  // Fall back to the physical code, but only when no logical shortcut token
  // exists, a real primary modifier (Ctrl or Meta) is held, and this is not an
  // AltGr (Ctrl+Alt) text-composition event. macOS is excluded — it already has
  // dedicated Option-composed fallbacks and Cmd shortcuts are layout-stable.
  if (getKeybindingPlatform(platform) === 'darwin') {
    return false
  }
  const hasPrimaryModifier = hasModifier(input, 'control') || hasModifier(input, 'meta')
  if (!hasPrimaryModifier) {
    return false
  }
  // AltGr surfaces as Ctrl+Alt on Windows/Linux; treat it as text, not a chord.
  if (hasModifier(input, 'control') && hasModifier(input, 'alt')) {
    return false
  }
  if (logicalKeyTokenFromInput(input) !== null) {
    return false
  }
  const key = input.key ?? ''
  return key !== '' && !MODIFIER_KEYS.has(key) && !isLatinShortcutKey(key)
}

export function canFallBackToPhysicalCode(input: KeybindingInput, platform: string): boolean {
  return (
    canUsePhysicalCodeFallback(input) || shouldUseNonLatinShortcutPhysicalFallback(input, platform)
  )
}

export function physicalCodeKeyTokenFromInput(input: KeybindingInput): string | null {
  const code = input.code ?? ''
  if (code.startsWith('Key') && code.length === 4) {
    return code.slice(3).toUpperCase()
  }
  if (code.startsWith('Digit') && code.length === 6) {
    return code.slice(5)
  }

  return normalizeKeyToken(code)
}

export function numpadCodeKeyTokenFromInput(input: KeybindingInput): string | null {
  const code = input.code ?? ''
  return code === 'NumpadAdd' || code === 'NumpadSubtract' ? normalizeKeyToken(code) : null
}

export function shouldUseMacOptionComposedCaptureFallback(
  input: KeybindingInput,
  platform: string
): boolean {
  // Why: macOS Option+key reports composed characters (Option+C -> ç), so
  // capturing Alt shortcuts needs the same physical-code fallback as matching.
  if (
    getKeybindingPlatform(platform) !== 'darwin' ||
    !hasModifier(input, 'alt') ||
    MODIFIER_KEYS.has(input.key ?? '')
  ) {
    return false
  }
  const physicalToken = physicalCodeKeyTokenFromInput(input)
  if (!physicalToken) {
    return false
  }
  return (
    (physicalToken.length === 1 && physicalToken >= 'A' && physicalToken <= 'Z') ||
    isPunctuationKeyToken(physicalToken)
  )
}

export function keyTokenFromInput(input: KeybindingInput, platform: string): string | null {
  const numpadKey = numpadCodeKeyTokenFromInput(input)
  if (numpadKey) {
    return numpadKey
  }
  const logicalKey = logicalKeyTokenFromInput(input)
  if (logicalKey) {
    return logicalKey
  }
  if (
    !canUsePhysicalCodeFallback(input) &&
    !shouldUseMacOptionComposedCaptureFallback(input, platform) &&
    !shouldUseNonLatinShortcutPhysicalFallback(input, platform)
  ) {
    return null
  }
  return physicalCodeKeyTokenFromInput(input)
}

// Why: the platform primary modifier canonicalizes to Mod, mirroring normal
// capture where Cmd on macOS / Ctrl elsewhere both become Mod.
export function canonicalDoubleTapToken(
  modifier: PhysicalModifierToken,
  platform: string
): ModifierToken {
  const isMac = platform === 'darwin'
  if (modifier === 'Cmd' && isMac) {
    return 'Mod'
  }
  if (modifier === 'Ctrl' && !isMac) {
    return 'Mod'
  }
  return modifier
}

export function keybindingFromInputWithOptions(
  input: KeybindingInput,
  platform: string,
  options: NormalizeKeybindingOptions = {}
): KeybindingValidationResult {
  if (input.doubleTapModifier) {
    return normalizeKeybindingWithOptions(
      `DoubleTap+${canonicalDoubleTapToken(input.doubleTapModifier, platform)}`,
      options
    )
  }
  const key = keyTokenFromInput(input, platform)
  if (!key) {
    return { ok: false, error: 'Press a key, not only a modifier.' }
  }

  const isMac = getKeybindingPlatform(platform) === 'darwin'
  const parts: string[] = []
  const primaryModifierPressed = isMac ? hasModifier(input, 'meta') : hasModifier(input, 'control')
  if (primaryModifierPressed) {
    parts.push('Mod')
  }
  if (isMac && hasModifier(input, 'control')) {
    parts.push('Ctrl')
  }
  if (!isMac && hasModifier(input, 'meta')) {
    parts.push('Cmd')
  }
  if (hasModifier(input, 'alt')) {
    parts.push('Alt')
  }
  if (hasModifier(input, 'shift')) {
    parts.push('Shift')
  }
  parts.push(key)

  return normalizeKeybindingWithOptions(parts.join('+'), options)
}

export function keybindingFromInputForAction(
  actionId: KeybindingActionId,
  input: KeybindingInput,
  platform: string
): KeybindingValidationResult {
  const result = keybindingFromInputWithOptions(
    input,
    platform,
    normalizeOptionsForAction(actionId)
  )
  if (!result.ok || !isDigitIndexActionId(actionId)) {
    return result
  }
  return canonicalizeDigitIndexBinding(result.value)
}
