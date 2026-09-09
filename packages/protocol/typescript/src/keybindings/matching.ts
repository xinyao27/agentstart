import { DEFINITIONS_BY_ID, DIGIT_INDEX_KEY_PATTERN } from './definitions.js'
import { getEffectiveKeybindingsForAction, keybindingIsActiveInContext } from './effective.js'
import {
  canFallBackToPhysicalCode,
  logicalKeyTokenFromInput,
  numpadCodeKeyTokenFromInput,
  physicalCodeKeyTokenFromInput,
  PUNCTUATION_KEY_TOKENS
} from './input.js'
import type {
  KeybindingActionId,
  KeybindingInput,
  KeybindingMatchOptions,
  KeybindingOverrides,
  ModifierToken,
  ParsedKeybinding
} from './model.js'
import { getKeybindingPlatform } from './platform.js'
import { canonicalizeParsedKeybinding, hasModifier, parseKeybinding } from './syntax.js'

export function platformModifiers(
  parsed: ParsedKeybinding,
  platform: string
): { meta: boolean; control: boolean; alt: boolean; shift: boolean } {
  const isMac = platform === 'darwin'
  return {
    meta: parsed.meta || (parsed.mod && isMac),
    control: parsed.control || (parsed.mod && !isMac),
    alt: parsed.alt,
    shift: parsed.shift
  }
}

export function modifierStateMatches(
  parsed: ParsedKeybinding,
  input: KeybindingInput,
  platform: string
): boolean {
  const expected = platformModifiers(parsed, platform)
  return (
    hasModifier(input, 'meta') === expected.meta &&
    hasModifier(input, 'control') === expected.control &&
    hasModifier(input, 'alt') === expected.alt &&
    hasModifier(input, 'shift') === expected.shift
  )
}

export function shouldUseMacOptionLetterPhysicalFallback(
  parsed: ParsedKeybinding,
  input: KeybindingInput,
  platform: string
): boolean {
  // Why: macOS Option+letter can report composed characters (Option+A -> å),
  // leaving no logical Latin key for app shortcuts that intentionally use Alt.
  return (
    getKeybindingPlatform(platform) === 'darwin' &&
    parsed.alt &&
    hasModifier(input, 'alt') &&
    logicalKeyTokenFromInput(input) === null
  )
}

export function shouldUseMacOptionPunctuationPhysicalFallback(
  parsed: ParsedKeybinding,
  input: KeybindingInput,
  platform: string
): boolean {
  // Why: macOS Option+punctuation can report composed quote/dead-key values,
  // leaving no logical bracket token for app shortcuts that intentionally use Alt.
  return (
    getKeybindingPlatform(platform) === 'darwin' &&
    parsed.alt &&
    hasModifier(input, 'alt') &&
    logicalKeyTokenFromInput(input) === null
  )
}

export function letterKeyMatches(
  input: KeybindingInput,
  letter: string,
  parsed: ParsedKeybinding,
  platform: string
): boolean {
  const logicalKey = logicalKeyTokenFromInput(input)
  if (logicalKey && logicalKey.length === 1 && logicalKey >= 'A' && logicalKey <= 'Z') {
    return logicalKey === letter.toUpperCase()
  }
  return (
    (canFallBackToPhysicalCode(input, platform) ||
      shouldUseMacOptionLetterPhysicalFallback(parsed, input, platform)) &&
    input.code === `Key${letter.toUpperCase()}`
  )
}

export function digitKeyMatches(input: KeybindingInput, digit: string, platform: string): boolean {
  const logicalKey = logicalKeyTokenFromInput(input)
  if (logicalKey && logicalKey.length === 1 && logicalKey >= '0' && logicalKey <= '9') {
    return logicalKey === digit
  }
  return canFallBackToPhysicalCode(input, platform) && input.code === `Digit${digit}`
}

export function isPunctuationKeyToken(token: string | null): token is string {
  return token !== null && PUNCTUATION_KEY_TOKENS.has(token)
}

export function semanticPunctuationKey(input: KeybindingInput): string | null {
  const logicalKey = logicalKeyTokenFromInput(input)
  return isPunctuationKeyToken(logicalKey) ? logicalKey : null
}

export function physicalPunctuationKey(input: KeybindingInput): string | null {
  const physicalKey = physicalCodeKeyTokenFromInput(input)
  return isPunctuationKeyToken(physicalKey) ? physicalKey : null
}

export function shouldUseSemanticPunctuation(
  parsed: ParsedKeybinding,
  input: KeybindingInput,
  platform: string
): boolean {
  // Why: Windows/Linux often expose AltGr as Ctrl+Alt. Do not turn ordinary
  // international text input into Mod+Alt app shortcuts.
  if (
    getKeybindingPlatform(platform) !== 'darwin' &&
    parsed.mod &&
    parsed.alt &&
    hasModifier(input, 'control') &&
    hasModifier(input, 'alt') &&
    !hasModifier(input, 'meta') &&
    physicalPunctuationKey(input) === null
  ) {
    return false
  }
  return true
}

export function keyMatches(
  parsedKey: string,
  input: KeybindingInput,
  parsed: ParsedKeybinding,
  platform: string
): boolean {
  if (parsedKey.length === 1 && parsedKey >= 'A' && parsedKey <= 'Z') {
    return letterKeyMatches(input, parsedKey, parsed, platform)
  }
  if (parsedKey.length === 1 && parsedKey >= '0' && parsedKey <= '9') {
    return digitKeyMatches(input, parsedKey, platform)
  }

  if (parsedKey === 'NumpadAdd' || parsedKey === 'NumpadSubtract') {
    return (
      numpadCodeKeyTokenFromInput(input) === parsedKey ||
      logicalKeyTokenFromInput(input) === parsedKey
    )
  }

  if (isPunctuationKeyToken(parsedKey)) {
    // Why: shortcut labels name logical punctuation, but international
    // layouts can report the same character from different physical codes.
    const semanticKey = semanticPunctuationKey(input)
    if (semanticKey !== null) {
      if (!shouldUseSemanticPunctuation(parsed, input, platform)) {
        return false
      }
      return semanticKey === parsedKey
    }
    return (
      (canFallBackToPhysicalCode(input, platform) ||
        shouldUseMacOptionPunctuationPhysicalFallback(parsed, input, platform)) &&
      physicalPunctuationKey(input) === parsedKey
    )
  }

  const logicalKey = logicalKeyTokenFromInput(input)
  if (logicalKey !== null) {
    return logicalKey === parsedKey
  }
  return (
    canFallBackToPhysicalCode(input, platform) && physicalCodeKeyTokenFromInput(input) === parsedKey
  )
}

export function resolveModifierToken(
  modifier: ModifierToken,
  platform: string
): 'meta' | 'control' | 'alt' | 'shift' {
  switch (modifier) {
    case 'Mod':
      return platform === 'darwin' ? 'meta' : 'control'
    case 'Cmd':
      return 'meta'
    case 'Ctrl':
      return 'control'
    case 'Alt':
      return 'alt'
    case 'Shift':
      return 'shift'
  }
}

export function keybindingMatchesInput(
  binding: string,
  input: KeybindingInput,
  platform: string
): boolean {
  const parsed = parseKeybinding(binding)
  if (!parsed) {
    return false
  }
  // A double-tap binding matches only a synthetic double-tap input, resolved per
  // platform; a normal binding never matches a synthetic input, and vice-versa.
  if (parsed.doubleTapModifier) {
    return (
      input.doubleTapModifier !== undefined &&
      resolveModifierToken(parsed.doubleTapModifier, platform) ===
        resolveModifierToken(input.doubleTapModifier, platform)
    )
  }
  if (input.doubleTapModifier !== undefined) {
    return false
  }
  return (
    modifierStateMatches(parsed, input, platform) && keyMatches(parsed.key, input, parsed, platform)
  )
}

export function keybindingMatchesAction(
  actionId: KeybindingActionId,
  input: KeybindingInput,
  platform: string,
  overrides?: KeybindingOverrides,
  options: KeybindingMatchOptions = {}
): boolean {
  const definition = DEFINITIONS_BY_ID.get(actionId)
  if (!definition) {
    return false
  }
  if (!keybindingIsActiveInContext(definition, options)) {
    return false
  }
  return getEffectiveKeybindingsForAction(actionId, platform, overrides).some((binding) =>
    keybindingMatchesInput(binding, input, platform)
  )
}

export function digitFromInput(input: KeybindingInput, platform: string): string | null {
  for (let value = 1; value <= 9; value++) {
    const digit = String(value)
    if (digitKeyMatches(input, digit, platform)) {
      return digit
    }
  }
  return null
}

// Why: digit-index rows bind a representative chord but fire for 1-9. Reuse the
// representative's modifier set with the pressed digit, then match it through the
// normal input matcher so Mod/Cmd resolution and layout fallbacks stay shared.
// Honors keybindingIsActiveInContext, so terminal-first focus disables the range
// just like the scope-based gating for every other shortcut.
export function matchKeybindingDigitIndex(
  actionId: KeybindingActionId,
  input: KeybindingInput,
  platform: string,
  overrides?: KeybindingOverrides,
  options: KeybindingMatchOptions = {}
): number | null {
  const definition = DEFINITIONS_BY_ID.get(actionId)
  if (!definition || !keybindingIsActiveInContext(definition, options)) {
    return null
  }
  const digit = digitFromInput(input, platform)
  if (!digit) {
    return null
  }
  for (const binding of getEffectiveKeybindingsForAction(actionId, platform, overrides)) {
    const parsed = parseKeybinding(binding)
    if (!parsed || parsed.doubleTapModifier || !DIGIT_INDEX_KEY_PATTERN.test(parsed.key)) {
      continue
    }
    const candidate = canonicalizeParsedKeybinding({ ...parsed, key: digit })
    if (keybindingMatchesInput(candidate, input, platform)) {
      return Number(digit) - 1
    }
  }
  return null
}
