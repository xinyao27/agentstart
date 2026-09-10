import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { DEFAULT_APP_FONT_FAMILY } from '@agentstart/protocol/settings/interface-font'
import { useEffect, useRef, useState } from 'react'
import { listInstalledFontFamilies } from '~renderer/runtime/settings-import-client'

import { getFallbackTerminalFonts, mergeFontSuggestions } from './constants'
import { useGhosttyImport } from './use-ghostty-import'
import { useWarpThemeImport } from './use-warp-theme-import'

type SettingsUpdate = (patch: Partial<GlobalSettings>) => Promise<void>

export function useFontSuggestions(
  updateSettings: SettingsUpdate,
  settings: GlobalSettings | null
) {
  const ghostty = useGhosttyImport(updateSettings, settings)
  const warpThemes = useWarpThemeImport(updateSettings, settings)
  const [fontSuggestions, setFontSuggestions] = useState<string[]>(
    mergeFontSuggestions([], getFallbackTerminalFonts())
  )
  const loadedRef = useRef(false)
  const loadPromiseRef = useRef<Promise<void> | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const requestFontSuggestions = (): void => {
    if (loadedRef.current || loadPromiseRef.current) {
      return
    }
    loadPromiseRef.current = listInstalledFontFamilies()
      .then((fonts) => {
        if (!mountedRef.current) {
          return
        }
        loadedRef.current = true
        if (fonts.length > 0) {
          setFontSuggestions((previous) => mergeFontSuggestions(fonts, previous))
        }
      })
      .catch(() => {})
      .finally(() => {
        loadPromiseRef.current = null
      })
  }

  return {
    fontSuggestions,
    ghostty,
    requestFontSuggestions,
    terminalFontSuggestions: fontSuggestions.filter((font) => font !== DEFAULT_APP_FONT_FAMILY),
    warpThemes
  }
}
