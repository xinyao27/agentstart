import type { GlobalWindowsRuntimeDefault } from '../../project/runtime-preference.js'
import type { TerminalQuickCommand } from '../../terminal/quick-commands.js'
import type { TerminalCustomTheme } from '../../terminal/theme-types.js'
import type { TerminalColorOverrides } from '../../terminal/theme-types.js'
import type { OpenInApplication, OpenInTargetKey } from '../open-in.js'
import type { SetupScriptLaunchMode } from '../workspace-preferences.js'

export type GlobalTerminalSettings = {
  terminalFontSize: number
  terminalFontFamily: string
  terminalFontWeight: number
  terminalLineHeight: number
  terminalScrollSensitivity: number
  terminalFastScrollSensitivity: number
  terminalTuiScrollSensitivity: number
  /** One-shot migration guard for moving inherited TUI wheel reports from 3 to 1. */
  terminalTuiScrollSensitivityDefaultedToOne?: boolean
  /** Terminal renderer policy.
   *  - 'auto': try xterm WebGL and fall back to DOM when unsupported or risky.
   *  - 'on': always try xterm WebGL.
   *  - 'off': keep terminal rendering on xterm's DOM renderer. */
  terminalGpuAcceleration: 'auto' | 'on' | 'off'
  /** Whether to enable programming-ligatures rendering via
   *  `@xterm/addon-ligatures`.
   *  - `'auto'` (default): enabled only when the configured font is known to
   *    ship ligatures (Fira Code, JetBrains Mono, Cascadia Code, etc.). This
   *    keeps the out-of-the-box experience right for users who install a
   *    ligature font without touching settings.
   *  - `'on'` / `'off'`: explicit override. Never changes when the user
   *    switches fonts, so "off" always stays off. */
  terminalLigatures: 'auto' | 'on' | 'off'
  terminalCursorStyle: 'bar' | 'block' | 'underline'
  /** One-shot migration guard for moving inherited cursor defaults to block. */
  terminalCursorStyleDefaultedToBlock?: boolean
  terminalCursorBlink: boolean
  terminalThemeDark: string
  terminalCustomThemes?: TerminalCustomTheme[]
  terminalDividerColorDark: string
  terminalUseSeparateLightTheme: boolean
  terminalThemeLight: string
  terminalDividerColorLight: string
  terminalInactivePaneOpacity: number
  terminalActivePaneOpacity: number
  terminalPaneOpacityTransitionMs: number
  terminalDividerThicknessPx: number
  /** One-shot migration guard for moving the inherited divider default from 3px to 1px. */
  terminalDividerThicknessDefaultedToHairline?: boolean
  terminalBackgroundOpacity?: number
  terminalColorOverrides?: TerminalColorOverrides
  terminalPaddingX?: number
  terminalPaddingY?: number
  terminalMouseHideWhileTyping?: boolean
  terminalWordSeparator?: string
  terminalCursorOpacity?: number
  terminalQuickCommands?: TerminalQuickCommand[]
  /** Pinned workspaces default to one sidebar location; this opt-in also shows natural groups. */
  showPinnedWorktreesInGroups?: boolean
  /** Why: Windows terminals conventionally use right-click as a paste gesture,
   *  while macOS/Linux default to their existing context menu behavior. */
  terminalRightClickToPaste: boolean
  /** One-shot guard that distinguishes the old global true default from a
   *  choice made after the setting became available on every platform. */
  terminalRightClickToPasteDefaultedForPlatform?: boolean
  /** Why: COMSPEC always points to cmd.exe on stock Windows, so without an
   *  explicit setting the terminal would always open CMD instead of the
   *  user's preferred shell. Defaults to 'powershell.exe' which is the
   *  modern choice for an IDE context. Only consulted on Windows. */
  terminalWindowsShell: string
  /** Why: when WSL is the Windows default shell, users with multiple distros
   *  need AgentStart to launch terminals and scan agents in the same chosen distro
   *  instead of whatever WSL currently marks as its global default. */
  terminalWindowsWslDistro?: string | null
  /** Why: account/auth location is independent from the user's preferred
   *  terminal shell. A user may default new terminals to WSL while still
   *  inspecting or adding Windows-scoped provider accounts. */
  localAccountRuntime: 'host' | 'wsl'
  localAccountWslDistro?: string | null
  /** Why: installed-agent detection is also a local environment choice. Keep
   *  it independent so users can inspect Windows and WSL PATH state without
   *  changing the default terminal shell. */
  localAgentRuntime?: 'host' | 'wsl'
  localAgentWslDistro?: string | null
  /** Why: global is only the default policy; project-level runtime preference wins. */
  localWindowsRuntimeDefault: GlobalWindowsRuntimeDefault
  /** Why: "PowerShell" is the product-facing shell family. Auto resolves to
   *  PowerShell 7+ when present and falls back to inbox Windows PowerShell. */
  terminalWindowsPowerShellImplementation: 'auto' | 'powershell.exe' | 'pwsh.exe'
  terminalFocusFollowsMouse: boolean
  /** Why: mirrors X11 / gnome-terminal "copy on select" UX — making a terminal
   *  selection copies it to the system clipboard automatically, so users can
   *  paste with Cmd/Ctrl+V without an intervening Cmd/Ctrl+Shift+C. Defaults
   *  to false so existing users keep the explicit-copy behavior. */
  terminalClipboardOnSelect: boolean
  /** Why: lets TUIs like Grok, tmux, nvim, and fzf copy to the system clipboard
   *  via the OSC 52 escape sequence — essential for SSH-hosted workflows where
   *  the terminal is the only bridge to the local clipboard. Defaults to
   *  false because OSC 52 is a classic data-exfiltration vector (any
   *  process piping untrusted output into the terminal — `cat attacker.log`
   *  — can silently rewrite the user's clipboard). Opt-in preserves the
   *  conservative default while making the capability one toggle away. */
  terminalAllowOsc52Clipboard: boolean
  /** Where the repo setup script runs on workspace create. Defaults to a
   *  background "Setup" tab so the user's main terminal stays immediately
   *  usable without the setup output crowding the initial pane. */
  setupScriptLaunchMode: SetupScriptLaunchMode
  terminalScrollbackRows: number
  /** Optional app-level proxy for daemon networking and locally spawned PTYs.
   *  Empty preserves system proxy settings plus inherited proxy env behavior. */
  httpProxyUrl?: string
  /** Optional semicolon/comma/newline-separated bypass rules for httpProxyUrl. */
  httpProxyBypassRules?: string
  /** Why: worktree-scoped localhost hostnames make same-app tabs distinguishable
   *  in external browsers. Opt-in (default off): serving the app under a different
   *  host can break dev apps that bind cookies/sessions to localhost. */
  localhostWorktreeLabelsEnabled?: boolean
  /** Extra launcher rows for the worktree "Open in" submenu. VS Code is always shown first. */
  openInApplications?: OpenInApplication[]
  /** Last launcher chosen from the tab-bar split button. Namespacing keeps built-ins collision-free. */
  lastOpenInTargetKey?: OpenInTargetKey
  /** Deprecated: migration/backward-compat only. Use PersistedUIState.rightSidebarOpen. */
  rightSidebarOpenByDefault: boolean
  showGitIgnoredFiles?: boolean
  /** Preferred Source Control changes layout. Per-user, not per-workspace. */
}
