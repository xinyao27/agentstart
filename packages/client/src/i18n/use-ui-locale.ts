import { useSyncExternalStore } from 'react'

import { getRendererLocale, subscribeRendererLocale } from './i18n'
import type { SupportedUiLocale } from './locale'

export function useUiLocale(): SupportedUiLocale {
  return useSyncExternalStore(subscribeRendererLocale, getRendererLocale, getRendererLocale)
}
