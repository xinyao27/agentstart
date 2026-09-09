import type { SupportedUiLocale } from './locale'

export type TranslationVariables = Record<string, unknown>

const PLURAL_COUNT_BY_SUFFIX = new Map([
  ['zero', 0],
  ['one', 1],
  ['two', 2],
  ['few', 3],
  ['many', 11],
  ['other', 2]
])

type CompiledMessageLookup = {
  key: string
  variables: TranslationVariables
}

function readCatalogMessage(messages: object, key: string): unknown {
  const direct = Reflect.get(messages, key)
  if (direct !== undefined) {
    return direct
  }
  let current: unknown = messages
  for (const segment of key.split('.')) {
    if (typeof current !== 'object' || current === null) {
      return undefined
    }
    current = Reflect.get(current, segment)
  }
  return current
}

function resolveI18nextSuffixLookup(
  key: string,
  variables: TranslationVariables | undefined
): CompiledMessageLookup | null {
  const contextSeparatorIndex = key.indexOf('_')
  if (contextSeparatorIndex < 0) {
    return null
  }

  const inputs: TranslationVariables = { ...variables }
  const pluralMatch = key.match(/_(zero|one|two|few|many|other)$/)
  const contextEnd = pluralMatch?.index ?? key.length
  const context = key.slice(contextSeparatorIndex + 1, contextEnd)
  if (context.length > 0) {
    inputs.context = context
  }

  if (pluralMatch) {
    const count = PLURAL_COUNT_BY_SUFFIX.get(pluralMatch[1])
    if (count !== undefined) {
      inputs.count = count
      inputs.value0 ??= count
    }
  }

  return {
    key: key.slice(0, contextSeparatorIndex),
    variables: inputs
  }
}

function interpolateFallback(
  fallback: string,
  variables: TranslationVariables | undefined
): string {
  if (!variables) {
    return fallback
  }
  return fallback.replace(/\{\{([^{}]+)\}\}/g, (placeholder, name: string) => {
    const value = variables[name.trim()]
    return value === undefined || value === null ? placeholder : String(value)
  })
}

export function renderCompiledMessage(
  messages: object,
  key: string,
  fallback: string,
  locale: SupportedUiLocale,
  variables?: TranslationVariables
): string {
  let message = readCatalogMessage(messages, key)
  let messageVariables = variables
  if (typeof message !== 'function' && typeof message !== 'string') {
    const lookup = resolveI18nextSuffixLookup(key, variables)
    if (lookup) {
      message = readCatalogMessage(messages, lookup.key)
      messageVariables = lookup.variables
    }
  }
  if (typeof message === 'string') {
    return interpolateFallback(message, messageVariables)
  }
  if (typeof message !== 'function') {
    return interpolateFallback(fallback, variables)
  }

  try {
    const value = Reflect.apply(message, undefined, [messageVariables ?? {}, { locale }])
    return typeof value === 'string' && value.length > 0
      ? value
      : interpolateFallback(fallback, variables)
  } catch {
    // Why: callers already provide an English fallback so a stale generated
    // catalog must not turn menu registration or renderer startup into a crash.
    return interpolateFallback(fallback, variables)
  }
}
