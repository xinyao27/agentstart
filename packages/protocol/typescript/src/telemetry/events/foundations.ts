import { z } from 'zod'

import type { GlobalSettings } from '../../settings/global/model'
import { SETUP_SCRIPT_IMPORT_PROVIDERS } from '../../setup/import-providers'
import { WORKSPACE_SOURCE_VALUES, type WorkspaceSource } from '../../workspace/source'
import { FEATURE_WALL_EXIT_ACTIONS, FEATURE_WALL_TOUR_DEPTH_STEPS } from '../feature-wall/depth'

export const AGENT_KIND_VALUES = [
  'claude-code',
  'openclaude',
  'codex',
  'autohand',
  'opencode',
  'mimo-code',
  'pi',
  'omp',
  'gemini',
  'antigravity',
  'aider',
  'goose',
  'amp',
  'kilo',
  'kiro',
  'crush',
  'aug',
  'cline',
  'codebuff',
  'command-code',
  'continue',
  'cursor',
  'droid',
  'kimi',
  'mistral-vibe',
  'qwen-code',
  'rovo',
  'hermes',
  'openclaw',
  'copilot',
  'grok',
  'devin',
  'ante',
  'trae',
  'other'
] as const
export const agentKindSchema = z.enum(AGENT_KIND_VALUES)
export type AgentKind = z.infer<typeof agentKindSchema>

// Trimmed to a small set of values Yiru's PTY-typed-command launch architecture
// can emit:
//   - `binary_not_found` — `provider.spawn` ENOENT (the *shell* binary is
//     missing). The agent CLI being missing is invisible: Yiru spawns a
//     healthy shell and types the command, and bash/zsh's "command not found"
//     surfaces only as terminal output.
//   - `paste_readiness_timeout` — bracketed-paste readiness wait timed out.
//     The agent process spawned but its TUI input box didn't reach a ready
//     state before the watchdog deadline, so the queued draft was dropped.
//   - `unknown` — every other thrown error (env-build failures,
//     unclassifiable shell-spawn errors).
// Provider-side errors (`auth_expired`, `rate_limited`, `network_timeout`,
// `provider_*`) happen inside the agent CLI subprocess and are not observable
// to Yiru — see telemetry-plan.md §Decision: Defer per-incident error fields.
// Adding a new value is additive-safe; do it when the call site lands, not in
// anticipation.
export const errorClassSchema = z.enum(['binary_not_found', 'paste_readiness_timeout', 'unknown'])
export type ErrorClass = z.infer<typeof errorClassSchema>

export const repoMethodSchema = z.enum(['folder_picker', 'clone_url', 'drag_drop'])

// Historical setup-step affordances users could pick after `repo_added` fired.
// Current Add Project flows skip that choice screen and auto-open the default
// checkout, but the schema stays for pre-rollout rows and compatibility.
export const addRepoSetupStepActionSchema = z.enum([
  'open_primary',
  'create_worktree',
  'configure',
  'skip',
  'open_existing',
  'back'
])

export const addRepoExistingWorkspaceSourceSchema = z.enum([
  'local_folder_picker',
  'runtime_server_path',
  'ssh_remote_path',
  'clone_url',
  'create_project'
])
export type AddRepoExistingWorkspaceSource = z.infer<typeof addRepoExistingWorkspaceSourceSchema>
export const addRepoDefaultCheckoutHandoffSourceSchema = z.enum([
  'local_folder_picker',
  'runtime_server_path',
  'ssh_remote_path',
  'clone_url',
  'create_project',
  'onboarding_open_folder',
  'onboarding_clone_url',
  'project_added_compat'
])
export type AddRepoDefaultCheckoutHandoffSource = z.infer<
  typeof addRepoDefaultCheckoutHandoffSourceSchema
>
export const addRepoDefaultCheckoutHandoffResultSchema = z.enum([
  'opened_default_checkout',
  'revealed_project'
])
export const addRepoDefaultCheckoutHandoffReasonSchema = z.enum([
  'loaded_default_checkout',
  'detected_default_checkout',
  'no_authoritative_detection',
  'no_default_checkout',
  'show_detected_default_failed',
  'show_detected_linked_failed',
  'authoritative_refresh_failed',
  'linked_external_refresh_failed',
  'refreshed_default_missing'
])

export const setupScriptImportProviderSchema = z.enum(SETUP_SCRIPT_IMPORT_PROVIDERS)

// Deliberately a separate enum from `errorClassSchema` (PTY-spawn taxonomy):
// different domain — this one buckets git/filesystem failures thrown by
// `createLocalWorktree` / `createRemoteWorktree`. Merging the two would lock
// both domains to the union forever, which the schema-evolution comment
// below warns against.
export const workspaceCreateErrorClassSchema = z.enum([
  'git_failed',
  'path_collision',
  'permission_denied',
  'base_ref_missing',
  'unknown'
])

export const workspaceSourceSchema = z.enum(WORKSPACE_SOURCE_VALUES)
export type { WorkspaceSource }

export const launchSourceSchema = z.enum([
  'command_palette',
  'sidebar',
  'quick_command',
  'tab_bar_quick_launch',
  'task_page',
  'new_workspace_composer',
  'workspace_jump_palette',
  'shortcut',
  'onboarding',
  'diff_notes_send',
  'notes_send',
  'conflict_resolution',
  'source_control_recovery',
  'terminal_context_menu',
  'unknown'
])
export type LaunchSource = z.infer<typeof launchSourceSchema>

export const requestKindSchema = z.enum(['new', 'resume', 'followup'])
export type RequestKind = z.infer<typeof requestKindSchema>

export const featureWallTileIdSchema = z.enum(['tile-01', 'tile-02', 'tile-04', 'tile-08'])
export type FeatureWallTileIdTelemetry = z.infer<typeof featureWallTileIdSchema>

export const featureWallOpenSourceSchema = z.enum(['help_menu', 'popup', 'onboarding', 'unknown'])
export type FeatureWallOpenSourceTelemetry = z.infer<typeof featureWallOpenSourceSchema>

export const featureWallWorkflowIdSchema = z.enum([
  'workspaces',
  'agents-orchestration',
  'workbench',
  'review'
])

export const featureWallTourDepthStepSchema = z.enum(FEATURE_WALL_TOUR_DEPTH_STEPS)

export const featureWallExitActionSchema = z.enum(FEATURE_WALL_EXIT_ACTIONS)

// `env_var` is deliberately absent — env-var and CI paths override consent at
// runtime only (see consent.ts); they never mutate `optedIn` and therefore
// never fire a `telemetry_opted_in/out` event. If a future path explicitly
// persists an env-var-driven opt-out, add `env_var` back here together with
// the call site.
//
// `first_launch_notice` (new-user disclosure toast) is deliberately absent —
// the new-user cohort has no first-launch surface (see telemetry-plan.md
// §First-launch experience). Opt-outs from new users come through
// `via: 'settings'`.
export const optInViaSchema = z.enum(['first_launch_banner', 'settings'])
export type OptInVia = z.infer<typeof optInViaSchema>

// Whitelist of settings whose `setting_key` may be emitted on
// `settings_changed`. If a setting isn't in this list, we do not emit.
//
// Keys are camelCase to match the actual field names in `GlobalSettings`.
// `yiru_channel` is intentionally absent — it is a build-time common
// property baked in from `YIRU_BUILD_IDENTITY`, not a user-togglable setting.
//
// Intentionally does NOT include the telemetry opt-in toggle — that is
// covered by the dedicated `telemetry_opted_in` / `telemetry_opted_out`
// events, which carry `via` context that a plain `settings_changed` could
// not. Listing it here would double-fire.
//
// Kept as an `as const` tuple so the Zod enum below and any call-site usage
// share one array — typo-drift is impossible.
type BooleanGlobalSettingsKey = {
  // Why: new persisted toggles may be optional for legacy-settings compatibility
  // while still being boolean settings once defaults are applied.
  [Key in keyof GlobalSettings]-?: NonNullable<GlobalSettings[Key]> extends boolean ? Key : never
}[keyof GlobalSettings]
export const SETTINGS_CHANGED_WHITELIST = [
  'editorAutoSave',
  'experimentalMobile',
  'experimentalTerminalAttention',
  'experimentalAgentHibernation',
  'geminiCliOAuthEnabled'
] as const satisfies readonly BooleanGlobalSettingsKey[]
export const settingsChangedKeySchema = z.enum(SETTINGS_CHANGED_WHITELIST)
export type SettingsChangedKey = z.infer<typeof settingsChangedKeySchema>

// ── Per-event schemas ───────────────────────────────────────────────────
//
// `.strict()` on every object is what enforces "no extra keys" at runtime —
// the validator does not need a separate extra-key check because zod rejects
// unknown keys at parse time. This is the runtime counterpart to the
// compile-time "unions of string literals, no raw `string`" rule.

// Cohort signal — see docs/onboarding-funnel-cohort-addendum.md. One integer
// shared across the events listed in `COHORT_EXTENDED` below: the count of
// repos the user has at emit time, read from `store.getRepos().length`.
// `.int().nonnegative()` constrains malformed values to the floor;
// `.optional()` lets the classifier's fail-soft fallback (returning
// `undefined`) validate cleanly so a read error never crashes a track call.
