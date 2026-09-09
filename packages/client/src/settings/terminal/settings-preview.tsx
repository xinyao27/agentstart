import { LigaturesAddon } from '@xterm/addon-ligatures'
import { Terminal } from '@xterm/xterm'
import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { resolveTerminalFontWeights } from '@yiru/protocol/terminal/font-settings'
import { normalizeTerminalLineHeight } from '@yiru/protocol/terminal/line-height'

import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Moon, Sun } from '~renderer/icons/hugeicons'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { buildFontFamily } from '~renderer/terminal-pane/layout-serialization'
import { buildDefaultTerminalOptions } from '~renderer/terminal-pane/pane-manager/pane-terminal-options'
import { composeActiveTerminalTheme } from '~renderer/terminal-pane/terminal-appearance'
import { resolveTerminalLigaturesEnabled } from '~renderer/terminal/ligatures'
import { clampNumber, resolveEffectiveTerminalAppearance } from '~renderer/terminal/theme'
import { Button } from '~renderer/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~renderer/ui/card'
import { cn } from '~renderer/ui/class-names'

import { SettingsSwitch } from '../form-controls'
import { PREVIEW_BUFFER } from './preview-content'

// Why: pin cols/rows so PREVIEW_BUFFER never wraps. Sized so the longest
// line (the def total signature, 32 chars) plus a few cols of margin fits
// the xterm canvas in the xl right-column at the default 14px font with
// the divider + stub pane carved off the right side. Larger fonts will
// extend past the xterm box's right edge — the box clips, which is
// preferable to wrapping mid-content.
const PREVIEW_COLS = 36
const PREVIEW_ROWS = 15

// Why: the old TerminalThemePreview rendered two side-by-side panes so the
// user could see the divider + inactive opacity in context. Keep that
// affordance with a real xterm on the left and a small color-only stub on
// the right. 40px is wide enough to read the inactive opacity dim against
// the active xterm, narrow enough not to crowd content.
const STUB_PANE_PX = 40

type PreviewMode = 'dark' | 'light'

type TerminalSettingsPreviewProps = {
  title: string
  description?: string
  settings: GlobalSettings
  systemPrefersDark: boolean
  /** Optional override for `settings.terminalFontFamily`. Set by the font
   *  picker while the user hovers a dropdown option so they can preview a
   *  font without committing the selection. */
  previewFontFamily?: string | null
  /** Force the preview into this mode regardless of app settings. Used by
   *  the Dark/Light theme sections so each pins its own theme. When set,
   *  the in-header theme toggle is hidden. */
  modeOverride?: PreviewMode
  /** When true, render a Moon/Sun toggle in the card header so the user
   *  can flip the preview between dark and light themes without changing
   *  the app theme. Initial mode follows the active app theme. Ignored
   *  when `modeOverride` is set. */
  showThemeToggle?: boolean
}

function resolveAppMode(
  settings: Pick<GlobalSettings, 'theme'>,
  systemPrefersDark: boolean
): PreviewMode {
  if (settings.theme === 'system') {
    return systemPrefersDark ? 'dark' : 'light'
  }
  return settings.theme
}

export function TerminalSettingsPreview({
  title,
  description,
  settings,
  systemPrefersDark,
  previewFontFamily,
  modeOverride,
  showThemeToggle
}: TerminalSettingsPreviewProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const ligaturesAddonRef = useRef<LigaturesAddon | null>(null)
  const skipInitialOptionMutationRef = useRef(false)
  const skipInitialThemeRewriteRef = useRef(false)

  const effectiveFontFamily = previewFontFamily || settings.terminalFontFamily
  const terminalLineHeight = normalizeTerminalLineHeight(settings.terminalLineHeight)

  // Why: lazy-init from the active app theme so the toggle starts in the
  // user's current mode. After init the toggle is independent — flipping
  // it doesn't change app settings, and changing the app theme later
  // doesn't reset the toggle.
  const [togglePreviewMode, setTogglePreviewMode] = useState<PreviewMode>(() =>
    resolveAppMode(settings, systemPrefersDark)
  )
  const [previewPaneDividerVisible, setPreviewPaneDividerVisible] = useState(false)

  // Why: precedence — modeOverride pins the mode; otherwise the in-header
  // toggle drives it; otherwise follow whatever the app is set to right
  // now (recomputed each render so plain previews track app theme changes).
  const effectiveMode: PreviewMode =
    modeOverride ??
    (showThemeToggle ? togglePreviewMode : resolveAppMode(settings, systemPrefersDark))

  // Why: reuse the live-pane resolver so divider color, theme palette, and
  // the dark/light variant rules (e.g. `useSeparateLightTheme`) stay in
  // lockstep with what real terminal panes render.
  // Why: list each property resolveEffectiveTerminalAppearance reads instead
  // of the whole settings object so unrelated changes (font, cursor) don't
  // re-derive the appearance. The lint can't see that settings flows through
  // the helper to those specific properties.
  const appearance = (() =>
    resolveEffectiveTerminalAppearance({ ...settings, theme: effectiveMode }, systemPrefersDark))()

  // Why: same — list the composeActiveTerminalTheme inputs explicitly so font
  // and cursor option changes don't trigger a buffer rewrite.
  const composedTheme = (() => composeActiveTerminalTheme(appearance.theme, settings))()

  const dividerThicknessPx = clampNumber(settings.terminalDividerThicknessPx, 1, 32)
  const inactivePaneOpacity = clampNumber(settings.terminalInactivePaneOpacity, 0, 1)
  const paneBackground = composedTheme?.background ?? '#000'

  const mountTerminal = useEventCallback(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const weights = resolveTerminalFontWeights(settings.terminalFontWeight)
    skipInitialOptionMutationRef.current = true
    skipInitialThemeRewriteRef.current = true
    // Why: DOM renderer only — multiple previews can mount at once and
    // WebGL contexts are scarce.
    // Why disableStdin: read-only preview. tabIndex/aria-hidden on the
    // wrapper don't reach xterm's internal textarea; disableStdin does.
    const terminal = new Terminal({
      ...buildDefaultTerminalOptions(),
      disableStdin: true,
      // Why mirror cursorInactiveStyle: the read-only preview never receives
      // focus, but it must still show the user's selected cursor shape.
      cursorInactiveStyle: settings.terminalCursorStyle,
      cursorStyle: settings.terminalCursorStyle,
      cursorBlink: settings.terminalCursorBlink,
      fontSize: settings.terminalFontSize,
      fontFamily: buildFontFamily(effectiveFontFamily),
      fontWeight: weights.fontWeight,
      fontWeightBold: weights.fontWeightBold,
      lineHeight: terminalLineHeight,
      theme: composedTheme ?? undefined,
      allowTransparency:
        settings.terminalBackgroundOpacity !== undefined && settings.terminalBackgroundOpacity < 1,
      cols: PREVIEW_COLS,
      rows: PREVIEW_ROWS
    })
    terminalRef.current = terminal

    try {
      terminal.open(container)
      terminal.write(PREVIEW_BUFFER)
    } catch (err) {
      terminalRef.current = null
      terminal.dispose()
      throw err
    }

    return () => {
      ligaturesAddonRef.current?.dispose()
      ligaturesAddonRef.current = null
      terminal.dispose()
      terminalRef.current = null
    }
  })
  useEffect(() => mountTerminal(), [mountTerminal])

  // Why: font/cursor options are mutated directly so the preview repaints in
  // xterm's normal cycle. No fit/refit needed since cols/rows are pinned.
  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) {
      return
    }
    if (skipInitialOptionMutationRef.current) {
      skipInitialOptionMutationRef.current = false
      return
    }
    const weights = resolveTerminalFontWeights(settings.terminalFontWeight)
    terminal.options.fontSize = settings.terminalFontSize
    terminal.options.fontFamily = buildFontFamily(effectiveFontFamily)
    terminal.options.fontWeight = weights.fontWeight
    terminal.options.fontWeightBold = weights.fontWeightBold
    terminal.options.lineHeight = terminalLineHeight
    terminal.options.cursorStyle = settings.terminalCursorStyle
    // Why: see constructor — keep the unfocused preview cursor unchanged.
    terminal.options.cursorInactiveStyle = settings.terminalCursorStyle
    terminal.options.cursorBlink = settings.terminalCursorBlink
  }, [
    settings.terminalFontSize,
    effectiveFontFamily,
    settings.terminalFontWeight,
    terminalLineHeight,
    settings.terminalCursorStyle,
    settings.terminalCursorBlink
  ])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal || !composedTheme) {
      return
    }
    terminal.options.theme = composedTheme
    // Why: matches the live pane policy in applyTerminalAppearance — without
    // this, an opacity < 1 background renders opaque inside xterm even though
    // the theme color carries an alpha channel.
    terminal.options.allowTransparency =
      settings.terminalBackgroundOpacity !== undefined && settings.terminalBackgroundOpacity < 1
    if (skipInitialThemeRewriteRef.current) {
      skipInitialThemeRewriteRef.current = false
      return
    }
    // Why reset() not clear(): clear() keeps the row the cursor sits on, and
    // our buffer ends mid-line on the prompt — so a follow-up clear+write
    // would leave the trailing prompt fragment and append the new buffer
    // beneath it, producing the duplicated content seen during font swaps.
    // reset() restores cursor home + wipes the buffer so the rewrite starts
    // from a clean slate.
    terminal.reset()
    terminal.write(PREVIEW_BUFFER)
  }, [composedTheme, settings.terminalBackgroundOpacity])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) {
      return
    }
    const enabled = resolveTerminalLigaturesEnabled(settings.terminalLigatures, effectiveFontFamily)
    const current = ligaturesAddonRef.current
    if (enabled && !current) {
      const addon = new LigaturesAddon()
      try {
        terminal.loadAddon(addon)
        ligaturesAddonRef.current = addon
        // Why: the preview writes its sample before this effect runs; repaint
        // so already-rendered operators switch to ligature glyphs immediately.
        terminal.refresh(0, terminal.rows - 1)
      } catch (err) {
        addon.dispose()
        console.warn('[settings preview] ligatures addon failed to attach', err)
        ligaturesAddonRef.current = null
      }
    } else if (!enabled && current) {
      current.dispose()
      ligaturesAddonRef.current = null
    }
  }, [settings.terminalLigatures, effectiveFontFamily])

  const showToggle = showThemeToggle && modeOverride === undefined

  return (
    <Card className="gap-4 overflow-hidden py-0">
      <CardHeader className="border-border/50 gap-0 border-b px-4 py-3 !pb-3">
        <div className="flex min-h-7 items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-sm">{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <div className="border-border/50 bg-background/40 flex items-center gap-2 border px-2 py-1">
              <span className="text-muted-foreground text-xs font-medium">
                {translate(
                  'auto.components.settings.TerminalSettingsPreview.50419052fe',
                  'Pane divider'
                )}
              </span>
              <SettingsSwitch
                checked={previewPaneDividerVisible}
                onChange={() => setPreviewPaneDividerVisible((visible) => !visible)}
                ariaLabel={translate(
                  'auto.components.settings.TerminalSettingsPreview.f8931d407d',
                  'Show pane divider in preview'
                )}
              />
            </div>
            {showToggle ? (
              <div
                className="border-border/50 flex gap-0.5 border p-0.5"
                role="group"
                aria-label={translate(
                  'auto.components.settings.TerminalSettingsPreview.2c248fcc27',
                  'Preview theme'
                )}
              >
                {(['dark', 'light'] as const).map((mode) => (
                  <Button
                    variant="quiet"
                    size="xs"
                    key={mode}
                    type="button"
                    onClick={() => setTogglePreviewMode(mode)}
                    aria-pressed={togglePreviewMode === mode}
                    aria-label={translate(
                      'auto.components.settings.TerminalSettingsPreview.a63953a48a',
                      'Preview {{value0}} theme',
                      { value0: mode }
                    )}
                    title={translate(
                      'auto.components.settings.TerminalSettingsPreview.a63953a48a',
                      'Preview {{value0}} theme',
                      { value0: mode }
                    )}
                    className={cn(
                      'h-auto border-0 ',
                      'p-1 ',
                      togglePreviewMode === mode ? 'bg-accent text-accent-foreground' : ' '
                    )}
                  >
                    {mode === 'dark' ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {/* Why: flex layout with xterm on the left and a stub pane on the
            right keeps inactive-pane opacity visible. The divider stays
            preview-only and opt-in so the default preview remains clean. */}
        <div className="border-border/50 flex h-[300px] flex-col overflow-hidden border">
          <div className="flex min-h-0 flex-1 overflow-hidden" aria-hidden="true">
            <div
              ref={containerRef}
              className="min-w-0 flex-1 overflow-hidden p-2 outline-none"
              style={{ backgroundColor: paneBackground }}
              tabIndex={-1}
            />
            {previewPaneDividerVisible ? (
              <div
                className="shrink-0"
                style={{
                  width: `${dividerThicknessPx}px`,
                  backgroundColor: appearance.dividerColor
                }}
              />
            ) : null}
            <div
              className="shrink-0"
              style={{
                width: `${STUB_PANE_PX}px`,
                backgroundColor: paneBackground,
                opacity: inactivePaneOpacity
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
