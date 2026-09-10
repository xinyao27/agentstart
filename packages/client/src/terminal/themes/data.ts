import type { ITheme } from '@xterm/xterm'

import { CLASSIC_TERMINAL_THEMES } from './classic'
import { DEFAULT_TERMINAL_THEMES } from './defaults'
import { POPULAR_DARK_TERMINAL_THEMES } from './popular-dark'
import { POPULAR_LIGHT_TERMINAL_THEMES } from './popular-light'
import { mergeTerminalThemeCatalogs } from './shared'
import type { TerminalThemeMap } from './types'

const THEME_CATEGORIES: readonly TerminalThemeMap[] = [
  DEFAULT_TERMINAL_THEMES,
  POPULAR_DARK_TERMINAL_THEMES,
  POPULAR_LIGHT_TERMINAL_THEMES,
  CLASSIC_TERMINAL_THEMES
]

const TERMINAL_THEMES: Record<string, ITheme> = mergeTerminalThemeCatalogs(...THEME_CATEGORIES)

export function getThemeNames(): string[] {
  return Object.keys(TERMINAL_THEMES).sort()
}

export function getTheme(name: string): ITheme | null {
  return TERMINAL_THEMES[name] ?? null
}
