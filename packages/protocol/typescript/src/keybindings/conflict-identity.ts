import { DIGIT_INDEX_KEY_PATTERN, isDigitIndexActionId } from './definitions.js'
import { platformModifiers, resolveModifierToken } from './matching.js'
import type { KeybindingActionId, ParsedKeybinding } from './model.js'
import { parseKeybinding } from './syntax.js'

export function keybindingConflictIdentityForParsed(
  parsed: ParsedKeybinding,
  platform: string
): string {
  if (parsed.doubleTapModifier) {
    return `DoubleTap:${resolveModifierToken(parsed.doubleTapModifier, platform)}`
  }
  const modifiers = platformModifiers(parsed, platform)
  return [
    modifiers.meta ? 'Meta' : '',
    modifiers.control ? 'Control' : '',
    modifiers.alt ? 'Alt' : '',
    modifiers.shift ? 'Shift' : '',
    parsed.key
  ].join('+')
}

export function keybindingConflictIdentity(binding: string, platform: string): string {
  const parsed = parseKeybinding(binding)
  return parsed ? keybindingConflictIdentityForParsed(parsed, platform) : binding
}

export function keybindingConflictIdentities(
  actionId: KeybindingActionId,
  binding: string,
  platform: string
): readonly string[] {
  const exact = keybindingConflictIdentity(binding, platform)
  if (!isDigitIndexActionId(actionId)) {
    return [exact]
  }
  const parsed = parseKeybinding(binding)
  if (!parsed || parsed.doubleTapModifier || !DIGIT_INDEX_KEY_PATTERN.test(parsed.key)) {
    return [exact]
  }
  return Array.from({ length: 9 }, (_, index) =>
    keybindingConflictIdentityForParsed({ ...parsed, key: String(index + 1) }, platform)
  )
}
