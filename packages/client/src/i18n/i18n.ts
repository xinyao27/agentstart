import type { UiLanguage } from '@yiru/protocol/settings/ui-language'

import type { SupportedUiLocale } from './locale'
import zhMessages from './locales/zh.json'
import { renderCompiledMessage, type TranslationVariables } from './message-renderer'
import { DEFAULT_LOCALE, resolveUiLocale } from './supported-languages'

let activeLocale: SupportedUiLocale = DEFAULT_LOCALE
const localeListeners = new Set<() => void>()

export function translate(key: string, fallback: string, variables?: TranslationVariables): string {
  // Why: English call sites already carry their source string. An all-locale function registry
  // made every renderer parse megabytes of wrappers before first paint; only the non-English
  // catalog needs to ship at runtime.
  const messages = activeLocale === 'zh' ? zhMessages : EMPTY_MESSAGES
  return renderCompiledMessage(messages, key, fallback, activeLocale, variables)
}

const EMPTY_MESSAGES = {}

export function getRendererLocale(): SupportedUiLocale {
  return activeLocale
}

export function subscribeRendererLocale(listener: () => void): () => void {
  localeListeners.add(listener)
  return () => localeListeners.delete(listener)
}

export function setRendererUiLanguage(language: UiLanguage): void {
  const locale = resolveUiLocale(language)
  document.documentElement.lang = locale
  if (locale === activeLocale) {
    return
  }
  activeLocale = locale
  for (const listener of localeListeners) {
    listener()
  }
}
