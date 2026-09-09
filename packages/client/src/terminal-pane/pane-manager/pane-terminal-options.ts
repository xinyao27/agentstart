import type { ITerminalOptions } from '@xterm/xterm'
import { DEFAULT_TERMINAL_FONT_SIZE } from '@yiru/protocol/terminal/font-settings'
import { DESKTOP_TERMINAL_SCROLLBACK_ROWS_DEFAULT } from '@yiru/protocol/terminal/scrollback-policy'

type TerminalCursorStyle = NonNullable<ITerminalOptions['cursorStyle']>
type TerminalCursorInactiveStyle = NonNullable<ITerminalOptions['cursorInactiveStyle']>

export const DEFAULT_TERMINAL_SCROLL_SENSITIVITY = 1.15
export const DEFAULT_TERMINAL_FAST_SCROLL_SENSITIVITY = 5

export function normalizeTerminalScrollSensitivity(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(10, Math.max(0.1, value))
    : DEFAULT_TERMINAL_SCROLL_SENSITIVITY
}

export function normalizeTerminalFastScrollSensitivity(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(20, Math.max(1, value))
    : DEFAULT_TERMINAL_FAST_SCROLL_SENSITIVITY
}

export function resolveTerminalCursorInactiveStyle(
  cursorStyle: TerminalCursorStyle | undefined
): TerminalCursorInactiveStyle {
  // Why: inactive panes keep the configured cursor shape so focus changes do
  // not introduce separate geometry.
  return cursorStyle ?? 'block'
}

export function buildDefaultTerminalOptions(): ITerminalOptions {
  const cursorStyle: TerminalCursorStyle = 'block'

  return {
    allowProposedApi: true,
    cursorBlink: true,
    cursorStyle,
    cursorInactiveStyle: resolveTerminalCursorInactiveStyle(cursorStyle),
    fontSize: DEFAULT_TERMINAL_FONT_SIZE,
    // Cross-platform fallback chain; keep in sync with FALLBACK_FONTS in layout-serialization.ts.
    fontFamily:
      '"SF Mono", "Menlo", "Monaco", "Cascadia Mono", "Consolas", "DejaVu Sans Mono", "Liberation Mono", "Symbols Nerd Font Mono", "MesloLGS Nerd Font", "JetBrainsMono Nerd Font", "Hack Nerd Font", monospace',
    fontWeight: '300',
    fontWeightBold: '500',
    scrollback: DESKTOP_TERMINAL_SCROLLBACK_ROWS_DEFAULT,
    // Why: Yiru's default terminal cells are taller than many users' baseline
    // terminal, so a small multiplier keeps row-per-wheel movement familiar.
    scrollSensitivity: DEFAULT_TERMINAL_SCROLL_SENSITIVITY,
    fastScrollSensitivity: DEFAULT_TERMINAL_FAST_SCROLL_SENSITIVITY,
    allowTransparency: false,
    // Why: agent CLIs sometimes render body text with ANSI white/bright-white
    // on light themes; xterm can keep those cells readable across renderers.
    minimumContrastRatio: 4.5,
    // Why: on macOS, non-US layouts rely on Option to compose characters like @ and €.
    macOptionIsMeta: false,
    macOptionClickForcesSelection: true,
    drawBoldTextInBrightColors: true,
    scrollbar: {
      // Why: slim VS Code-style scrollbar (VS Code uses 14). FitAddon reserves
      // this as a gutter, costing ~1 column per pane — accepted tradeoff so the
      // scrollbar never covers content (evidence in PR #5051). The v1.4.51
      // table corruption #4877 fixed by zeroing this was actually the ZWJ
      // width bug; it stays fixed by terminal-pane/emulator/unicode-provider.ts. Width
      // also enables the overview ruler, whose border is hidden in
      // composeActiveTerminalTheme.
      width: 7
    },
    // Why: advertise kitty keyboard protocol support so CLIs that probe
    // (CSI ? u) know Yiru accepts enhanced key reporting. Yiru still writes
    // CSI-u for Shift+Enter on non-Windows platforms; programs that respect
    // the handshake otherwise fall back to legacy encodings and miss it.
    // Matches VS Code's xtermTerminal.ts.
    vtExtensions: {
      kittyKeyboard: true
    }
  }
}
