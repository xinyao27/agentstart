import { registerCustomTheme, type ThemeRegistration } from '@pierre/diffs'

import {
  CURSOR_DARK_THEME_NAME,
  CURSOR_LIGHT_THEME_NAME,
  cursorDarkThemeSource,
  cursorLightThemeSource,
  type CursorThemeSource
} from './source'

let cursorThemesRegistered = false

export const CURSOR_PIERRE_UNSAFE_CSS = `
  /* Why: Pierre omits inherited letter spacing and centers its caret across the insertion edge. */
  [data-content] { letter-spacing: 0; }
  [data-caret] { translate: 1px 0; }
  [data-line-type="change-addition"] {
    --diffs-line-bg: var(--editor-diff-inserted-line-background) !important;
  }
  [data-line-type="change-deletion"] {
    --diffs-line-bg: var(--editor-diff-removed-line-background) !important;
  }
`

function createCursorPierreTheme(
  source: CursorThemeSource,
  name: string,
  type: 'dark' | 'light'
): ThemeRegistration {
  const tokenColors = source.tokenColors.map((rule) => {
    const settings = { ...rule.settings }
    delete settings.fontStyle
    return { ...rule, settings }
  })
  const semanticTokenColors = Object.fromEntries(
    Object.entries(source.semanticTokenColors ?? {}).map(([scope, value]) => {
      if (typeof value === 'string') {
        return [scope, value]
      }
      const settings = { ...value }
      delete settings.fontStyle
      return [scope, settings]
    })
  )

  // Why: Cursor's syntax colors belong in the diff theme, but italics/bold are
  // typography and must remain controlled by the user's editor font settings.
  return { ...source, name, type, tokenColors, semanticTokenColors } as ThemeRegistration
}

export function registerCursorPierreThemes(): void {
  if (cursorThemesRegistered) {
    return
  }
  cursorThemesRegistered = true

  // Why: Pierre uses Shiki rather than Monaco; register the same Cursor source
  // so read-only and editable diffs do not switch syntax palettes.
  registerCustomTheme(CURSOR_DARK_THEME_NAME, () =>
    Promise.resolve(createCursorPierreTheme(cursorDarkThemeSource, CURSOR_DARK_THEME_NAME, 'dark'))
  )
  registerCustomTheme(CURSOR_LIGHT_THEME_NAME, () =>
    Promise.resolve(
      createCursorPierreTheme(cursorLightThemeSource, CURSOR_LIGHT_THEME_NAME, 'light')
    )
  )
}
