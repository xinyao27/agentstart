import type { TuiAgent } from '../../agent/types.js'
import type {
  ClaudeManagedAccount,
  ClaudeManagedAccountRuntimeSelection,
  CodexManagedAccount,
  CodexManagedAccountRuntimeSelection
} from '../managed-accounts.js'
import type { NotificationSettings } from '../notifications.js'

export type GlobalAgentSettings = {
  notifications: NotificationSettings
  /** When true, a countdown timer is shown after a Claude agent becomes idle,
   *  indicating time remaining before the prompt cache expires. Disabled by default. */
  promptCacheTimerEnabled: boolean
  /** Prompt-cache TTL in milliseconds. Only two values are supported:
   *  300 000 (5 min, the standard Anthropic API / Bedrock TTL) and
   *  3 600 000 (1 hr, for extended-TTL plans). */
  promptCacheTtlMs: number
  /** Why: Codex rate-limit account routing is a durable app preference owned by
   *  the main process, not transient UI state. Persisting the selected managed
   *  auth here lets AgentStart prepare shared ~/.codex before the renderer hydrates,
   *  while keeping this scope explicitly separate from Codex usage analytics
   *  and external terminal sessions. */
  codexManagedAccounts: CodexManagedAccount[]
  activeCodexManagedAccountId: string | null
  activeCodexManagedAccountIdsByRuntime?: CodexManagedAccountRuntimeSelection
  /** Why: Claude Code keeps conversations under one shared config root. AgentStart
   *  persists only per-account auth material here so switching accounts does
   *  not fork prior chat/session context the way CLAUDE_CONFIG_DIR swapping would. */
  claudeManagedAccounts: ClaudeManagedAccount[]
  activeClaudeManagedAccountId: string | null
  activeClaudeManagedAccountIdsByRuntime?: ClaudeManagedAccountRuntimeSelection
  /** When true, each worktree gets its own shell history file so ArrowUp
   *  does not surface commands from other worktrees. Defaults to true.
   *  Disable to revert to shared global shell history. */
  terminalScopeHistoryByWorktree: boolean
  /** Kill switch for hidden terminal view parking — unmounting long-hidden
   *  terminal panes while a pane-less watcher keeps PTY side effects alive.
   *  Defaults to true; `false` disables parking entirely.
   *  See docs/reference/terminal-hidden-view-parking.md. */
  terminalHiddenViewParking?: boolean
  terminalSshViewParking?: boolean
  terminalHiddenWorktreeRetentionBudget?: boolean
  /** Which agent to pre-select in the new-workspace composer.
   *  - null: auto (first detected agent)
   *  - 'blank': blank terminal (no agent launched)
   *  - TuiAgent: a specific agent id */
  defaultTuiAgent: TuiAgent | 'blank' | null
  /** Agents hidden from future picker and automatic launch choices. Detection
   *  remains a raw PATH capability snapshot. */
  disabledTuiAgents: TuiAgent[]
  /** Why: worktree deletion is destructive (git worktree remove + rm -rf of the
   *  working directory), so AgentStart shows a confirmation dialog by default. Users
   *  who delete frequently can opt into skipping the dialog via a "Don't ask
   *  again" checkbox inside it or from the General settings pane. We keep this
   *  defaulted to false so first-time behavior stays safe. */
  skipDeleteWorktreeConfirm: boolean
  /** Why: closing a terminal with child processes kills foreground work. Keep
   *  this separate from other destructive confirmations so power users can speed
   *  up terminal cleanup without weakening workspace safeguards. */
  skipCloseTerminalWithRunningProcessConfirm: boolean
  /** Why: Codex rate-limit resets consume a scarce reset credit and immediately
   *  affect the signed-in account, so keep the skip preference explicit and
   *  separate from local destructive-action confirmations. */
  skipCodexRateLimitResetConfirm: boolean
  /** Session cookie for OpenCode Go rate-limit fetching. Stored encrypted. */
  opencodeSessionCookie: string
  /** Optional workspace ID override for OpenCode Go. When set, skips the
   *  workspaces lookup and fetches usage directly for this workspace. */
  opencodeWorkspaceId: string
  /** Optional MiniMax group id. When empty, the usage fetcher extracts minimax_group_id_v2 from the cookie. */
  minimaxGroupId: string
  /** Comma-separated MiniMax model names to show in the status bar usage window. */
  minimaxUsageModels: string
  /** Whether to extract OAuth credentials from the local Gemini CLI installation
   *  for rate-limit fetching. Disabled by default for explicit opt-in. */
  geminiCliOAuthEnabled: boolean
  /** Per-agent CLI command overrides. A missing key means use the catalog default binary name. */
  agentCmdOverrides: Partial<Record<TuiAgent, string>>
  /** Why: AgentStart bridges Codex session history from the user's real Codex home into
   *  its managed home so /resume finds it, but defaults to ~/.codex. Users who run
   *  Codex with a custom CODEX_HOME can point history discovery at that folder here.
   *  History-only: this does not change which account/config/hooks AgentStart uses. */
  codexSessionSourceHome?: {
    /** Absolute host path; empty/undefined falls back to ~/.codex. */
    host?: string
    /** Per-WSL-distro absolute Linux path; missing distro falls back to <wslHome>/.codex. */
    wsl?: Record<string, string>
  }
  /** Per-agent default CLI arguments appended after the binary/path and before prompts. */
  agentDefaultArgs?: Partial<Record<TuiAgent, string>>
  /** Per-agent launch environment defaults used when yolo mode is exposed as env. */
  agentDefaultEnv?: Partial<Record<TuiAgent, Record<string, string>>>
  /** One-shot guard for adding yolo-mode default args to untouched agent launch profiles. */
  agentYoloDefaultsMigrated?: boolean
  /** Why: disabling must persist so startup does not reinstall global agent
   *  hook entries right after the user removes them from Settings or CLI. */
  agentStatusHooksEnabled: boolean
  /** Dismissed freshness tuples grant no write authority; they only keep the
   *  same exact official placement/revision from nudging more than once. */
  dismissedSkillFreshnessNudges?: string[]
  /** Why: generated tab titles are semantic but subjective, so they stay opt-in
   *  and manual renames remain the stronger user intent. */
  tabAutoGenerateTitle: boolean
  /** Why: pinned tabs can still be closed via the keyboard/native-menu close
   *  path, so this gates that close behind a confirmation prompt to prevent
   *  accidental loss. Defaults on. */
  confirmClosePinnedTab: boolean
  /** When true, AgentStart requests local awake assertions while hook-reported agents are working. */
  keepComputerAwakeWhileAgentsRun: boolean
  /** Why: macOS terminals must choose between letting Option compose layout
   *  characters (@ on German, € on French) or treating Option as Meta/Esc for
   *  readline shortcuts. Mirrors Ghostty's macos-option-as-alt setting — and
   *  like Ghostty, defaults to 'auto', which fingerprints the active keyboard
   *  layout via navigator.keyboard.getLayoutMap() at runtime and picks
   *  'true' for US / US-International and 'false' for everything else.
   *  'auto'  = layout-aware (default). See docs/terminal-option-key-layout-aware-default.md.
   *  'false' = compose (for non-US keyboards);
   *  'true'  = full Meta on both Option keys;
   *  'left' / 'right' = only that Option key acts as Meta, the other composes. */
  terminalMacOptionAsAlt: 'auto' | 'true' | 'false' | 'left' | 'right'
  /** One-shot migration guard for the 'auto' rollout. Before this field landed,
   *  the field defaulted to 'true' for everyone, meaning a persisted 'true'
   *  could either be an explicit user choice or just the old default. On first
   *  launch after upgrade, if this flag is false and the persisted value is
   *  'true', we reset to 'auto' so non-US users stop getting their keyboard
   *  broken by the stale global default. US users land on 'true' anyway via
   *  detection, so no visible behavior change. Then we flip this flag to true
   *  and never migrate again. */
  terminalMacOptionAsAltMigrated: boolean
  /** Controls whether macOS terminal input translates the physical JIS Yen (¥)
   *  key to a backslash, matching the common terminal expectation for that key. */
  terminalJISYenToBackslash: boolean
}
