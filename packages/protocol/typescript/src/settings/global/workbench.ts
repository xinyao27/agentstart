import type { KeybindingOverrides, TerminalShortcutPolicy } from '../../keybindings/registry.js'
import type { SourceControlGroupOrder } from '../../source-control/group-order.js'
import type { CtrlTabOrderMode } from '../../workspace/tabs.js'
import type { SourceControlViewMode } from '../workspace-preferences.js'

export type GlobalWorkbenchSettings = {
  sourceControlViewMode: SourceControlViewMode
  /** Preferred Source Control group order. Per-user, not per-workspace. */
  sourceControlGroupOrder: SourceControlGroupOrder
  /** When enabled, the Source Control compare base defaults to the current
   *  branch's upstream (prioritizing local changes) instead of the repo
   *  default branch. Only affects the compare/diff view, not the PR/rebase
   *  merge target. Per-user, not per-workspace. */
  sourceControlCompareAgainstUpstream: boolean
  /** Deprecated: retained so older persisted settings remain readable. */
  showTitlebarAppName: boolean
  /** Why: Yiru Mobile remains reachable from Settings; this only controls
   *  whether the top-level sidebar shortcut is shown. */
  showMobileButton?: boolean
  /** Controls how Ctrl+Tab chooses the next visible tab. Optional for
   *  profiles saved before this setting existed; readers default to MRU. */
  ctrlTabOrderMode?: CtrlTabOrderMode
  /** Why: Yiru-first preserves fast workspace/app control from agent TUIs.
   *  Terminal-first is opt-in for users who want shell/TUI bindings to win. */
  terminalShortcutPolicy?: TerminalShortcutPolicy
  /** Legacy pre-file-backed keyboard shortcut overrides. New writes go to
   *  ~/.yiru/keybindings.json; main migrates this once when present. */
  keybindings?: KeybindingOverrides
  diffDefaultView: 'inline' | 'side-by-side'
  diffWordWrap: boolean
  /** Comment author logins the user manually marked as bots (stored lowercased).
   *  Why: some review bots use regular user accounts that defeat both provider
   *  metadata and login heuristics, so the Humans/Bots comment filter needs a
   *  user-supplied escape hatch. */
  prBotAuthorOverrides: string[]
}
