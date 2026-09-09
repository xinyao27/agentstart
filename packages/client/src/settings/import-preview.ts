import type { GhosttyImportPreviewValue, WarpThemeImportPreviewValue } from '@yiru/protocol'
import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import type { WarpThemeImportPreview } from '@yiru/protocol/terminal/theme-types'
import { translate } from '~renderer/i18n/i18n'
import { normalizeTerminalColorOverrides } from '~renderer/terminal/themes/custom'

export type GhosttyImportPreview = Omit<GhosttyImportPreviewValue, 'diff'> & {
  diff: Partial<GlobalSettings>
}

export function ghosttyImportPreview(preview: GhosttyImportPreviewValue): GhosttyImportPreview {
  const diff: Partial<GlobalSettings> = {}
  for (const [key, value] of Object.entries(preview.diff)) {
    switch (key) {
      case 'terminalBackgroundOpacity':
      case 'terminalInactivePaneOpacity':
      case 'terminalCursorOpacity':
      case 'terminalFontSize':
      case 'terminalFontWeight':
      case 'terminalPaddingX':
      case 'terminalPaddingY':
      case 'terminalLineHeight':
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw invalidField(key)
        }
        diff[key] = value
        break
      case 'terminalMouseHideWhileTyping':
      case 'terminalCursorBlink':
      case 'terminalFocusFollowsMouse':
        if (typeof value !== 'boolean') {
          throw invalidField(key)
        }
        diff[key] = value
        break
      case 'terminalFontFamily':
      case 'terminalDividerColorDark':
      case 'terminalDividerColorLight':
        if (typeof value !== 'string') {
          throw invalidField(key)
        }
        diff[key] = value
        break
      case 'terminalCursorStyle':
        if (value !== 'bar' && value !== 'block' && value !== 'underline') {
          throw invalidField(key)
        }
        diff.terminalCursorStyle = value
        break
      case 'terminalMacOptionAsAlt':
        if (
          value !== 'auto' &&
          value !== 'true' &&
          value !== 'false' &&
          value !== 'left' &&
          value !== 'right'
        ) {
          throw invalidField(key)
        }
        diff.terminalMacOptionAsAlt = value
        break
      case 'terminalColorOverrides':
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          throw invalidField(key)
        }
        diff.terminalColorOverrides = normalizeTerminalColorOverrides(value)
        break
      default:
        throw invalidField(key)
    }
  }
  return { ...preview, diff }
}

export function warpImportPreview(preview: WarpThemeImportPreviewValue): WarpThemeImportPreview {
  return {
    ...preview,
    themes: preview.themes.map((theme) => ({
      ...theme,
      terminal: normalizeTerminalColorOverrides(theme.terminal)
    }))
  }
}

function invalidField(key: string): TypeError {
  return new TypeError(
    translate(
      'settings.import.invalidField',
      'The terminal import returned an invalid setting: {{field}}',
      { field: key }
    )
  )
}
