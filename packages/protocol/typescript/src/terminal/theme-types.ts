export type TerminalColorOverrides = {
  foreground?: string
  background?: string
  cursor?: string
  cursorAccent?: string
  selectionBackground?: string
  selectionForeground?: string
  black?: string
  red?: string
  green?: string
  yellow?: string
  blue?: string
  magenta?: string
  cyan?: string
  white?: string
  brightBlack?: string
  brightRed?: string
  brightGreen?: string
  brightYellow?: string
  brightBlue?: string
  brightMagenta?: string
  brightCyan?: string
  brightWhite?: string
  // Why: xterm.js ITheme does not expose a `bold` key, but Ghostty users
  // expect the setting to be preserved so a future renderer CSS override
  // or xterm upgrade can honour it without a migration.
  bold?: string
}

export type TerminalCustomThemeSource = 'warp' | 'ghostty' | 'manual'
export type TerminalCustomThemeMode = 'dark' | 'light' | 'unknown'

export type TerminalCustomTheme = {
  id: string
  name: string
  source: TerminalCustomThemeSource
  mode: TerminalCustomThemeMode
  terminal: TerminalColorOverrides
  importedAt: string
  sourceLabel?: string
  unsupportedFeatures?: string[]
}

export type WarpThemeImportSource =
  | { kind: 'auto' }
  | { kind: 'chooseFile' }
  | { kind: 'chooseFolder' }

export type WarpThemeImportPreviewTheme = TerminalCustomTheme & {
  selectionValue: string
}

export type WarpThemeImportSkippedFile = {
  label: string
  reason: string
}

export type WarpThemeImportPreview = {
  found: boolean
  /** True when the user dismissed the native picker without selecting anything. */
  canceled?: boolean
  desktopOnly?: boolean
  sourceLabel?: string
  themes: WarpThemeImportPreviewTheme[]
  skippedFiles: WarpThemeImportSkippedFile[]
  error?: string
}
