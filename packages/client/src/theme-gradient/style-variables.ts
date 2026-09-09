import type { ThemeGradientTheme } from '@yiru/protocol/settings/theme-gradient'
import { useEffect } from 'react'
import { useAppStore } from '~renderer/store/state'

import { resolveDocumentTheme } from '../editor/document-theme'
import { buildThemeGradientStyle } from './gradient-css'
import { resolveThemeGradient } from './state'

export type ThemeGradientStyleVariables = Record<string, string>

export function resolveThemeGradientStyleVariables(
  theme: ThemeGradientTheme | null,
  isDarkMode: boolean
): ThemeGradientStyleVariables | undefined {
  if (!theme) {
    return undefined
  }
  const style = buildThemeGradientStyle(theme, { isDarkMode })
  if (!style) {
    return undefined
  }
  return {
    '--app-theme-gradient': style.backgroundImage,
    '--app-theme-surface-alpha': `${Math.round(style.surfaceAlpha * 1000) / 10}%`,
    '--app-theme-tint': `${Math.round(style.tint * 1000) / 10}%`,
    // Why: --brand remains the single color input; the themed app scope
    // rebinds every semantic alias that needs to follow it.
    '--brand': style.accentColor
  }
}

/**
 * Style variables for the active workspace's theme, or `undefined` when no
 * theme applies and the app should keep its stock chrome.
 */
export function useThemeGradientStyleVariables(
  systemPrefersDark: boolean
): ThemeGradientStyleVariables | undefined {
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const themeGradientDefault = useAppStore((s) => s.themeGradientDefault)
  const themeGradientsByWorkspaceId = useAppStore((s) => s.themeGradientsByWorkspaceId)
  const themePreference = useAppStore((s) => s.settings?.theme)
  const styleVariables = (() => {
    const theme = resolveThemeGradient(
      { themeGradientDefault, themeGradientsByWorkspaceId },
      activeWorktreeId
    )
    const isDarkMode = resolveDocumentTheme(themePreference ?? 'system', () => ({
      matches: systemPrefersDark
    }))
    return resolveThemeGradientStyleVariables(theme, isDarkMode)
  })()
  const brand = styleVariables?.['--brand']
  useEffect(() => {
    if (!brand) {
      return
    }
    const root = document.documentElement
    // Why: Base UI portals render under body instead of the themed app node, so
    // the same brand input must also exist at their inheritance root.
    root.dataset.themeGradientPortals = 'on'
    root.style.setProperty('--brand', brand)
    return () => {
      delete root.dataset.themeGradientPortals
      root.style.removeProperty('--brand')
    }
  }, [brand])
  return styleVariables
}
