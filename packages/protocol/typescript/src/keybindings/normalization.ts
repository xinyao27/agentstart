import { DEFINITIONS_BY_ID, DIGIT_INDEX_KEY_PATTERN, isDigitIndexActionId } from './definitions.js'
import type {
  KeybindingActionId,
  KeybindingValidationResult,
  NormalizeKeybindingOptions
} from './model.js'
import {
  canonicalizeParsedKeybinding,
  normalizeKeybindingWithOptions,
  parseKeybinding
} from './syntax.js'

export function isDoubleTapBinding(binding: string): boolean {
  return Boolean(parseKeybinding(binding)?.doubleTapModifier)
}

export function normalizeKeybindingListWithOptions(
  input: string,
  options: NormalizeKeybindingOptions = {}
): KeybindingValidationResult | string[] {
  const trimmed = input.trim()
  if (!trimmed) {
    return []
  }
  const normalized: string[] = []
  for (const piece of trimmed.split(',')) {
    const result = normalizeKeybindingWithOptions(piece, options)
    if (!result.ok) {
      return result
    }
    if (!normalized.includes(result.value)) {
      normalized.push(result.value)
    }
  }
  return normalized
}

export function normalizeKeybindingArrayWithOptions(
  input: readonly string[],
  options: NormalizeKeybindingOptions = {}
): KeybindingValidationResult | string[] {
  const normalized: string[] = []
  for (const binding of input) {
    const piece = normalizeKeybindingListWithOptions(binding, options)
    if (!Array.isArray(piece)) {
      return piece
    }
    for (const normalizedBinding of piece) {
      if (!normalized.includes(normalizedBinding)) {
        normalized.push(normalizedBinding)
      }
    }
  }
  return normalized
}

export function normalizeOptionsForAction(
  actionId: KeybindingActionId
): NormalizeKeybindingOptions {
  return {
    allowBareKeybindings: DEFINITIONS_BY_ID.get(actionId)?.allowBareKeybindings === true
  }
}

// Why: a digit-index row stores one representative chord. Rewrite the key to 1
// so display and conflict detection stay stable across the 1-9 range, and
// reject anything that is not a number key 1-9. Extra modifiers (e.g. Shift) are
// intentionally allowed — only the key must be a digit; parseKeybinding has
// already enforced that at least one modifier is present.
export function canonicalizeDigitIndexBinding(binding: string): KeybindingValidationResult {
  const parsed = parseKeybinding(binding)
  if (!parsed || parsed.doubleTapModifier || !DIGIT_INDEX_KEY_PATTERN.test(parsed.key)) {
    return {
      ok: false,
      error: 'Pick a number key 1–9 with a modifier, like Cmd+1 or Ctrl+1.'
    }
  }
  return { ok: true, value: canonicalizeParsedKeybinding({ ...parsed, key: '1' }) }
}

export function finalizeDigitIndexBindings(
  actionId: KeybindingActionId,
  result: KeybindingValidationResult | string[]
): KeybindingValidationResult | string[] {
  if (!isDigitIndexActionId(actionId) || !Array.isArray(result)) {
    return result
  }
  const canonical: string[] = []
  for (const binding of result) {
    const normalized = canonicalizeDigitIndexBinding(binding)
    if (!normalized.ok) {
      return normalized
    }
    if (!canonical.includes(normalized.value)) {
      canonical.push(normalized.value)
    }
  }
  return canonical
}

export function normalizeKeybindingListForAction(
  actionId: KeybindingActionId,
  input: string
): KeybindingValidationResult | string[] {
  return finalizeDigitIndexBindings(
    actionId,
    normalizeKeybindingListWithOptions(input, normalizeOptionsForAction(actionId))
  )
}

export function normalizeKeybindingArrayForAction(
  actionId: KeybindingActionId,
  input: readonly string[]
): KeybindingValidationResult | string[] {
  return finalizeDigitIndexBindings(
    actionId,
    normalizeKeybindingArrayWithOptions(input, normalizeOptionsForAction(actionId))
  )
}
