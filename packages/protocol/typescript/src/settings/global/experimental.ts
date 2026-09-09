import type { SourceControlAiSettings } from '../../source-control/ai-types.js'
import type { CommitMessageAiSettings } from '../../source-control/legacy-settings.js'

export type GlobalExperimentalSettings = {
  experimentalMobile: boolean
  /** Why: the iOS Simulator feature is default-on for capable macOS hosts, but
   *  users need a durable off switch that hides UI affordances and blocks CLI attach. */
  mobileEmulatorEnabled?: boolean
  /** Preferred iOS Simulator UDID for UI auto-attach and agent CLI attach. */
  mobileEmulatorDefaultDeviceUdid?: string | null
  /** Auto-restore window for a phone-fit PTY after the last mobile
   *  subscriber leaves. `null` (default) holds the PTY at phone size
   *  indefinitely; the desktop "Restore" banner remains the explicit
   *  return-to-desktop-size action. A finite millisecond value schedules
   *  an automatic restore that long after the last unsubscribe. Clamped
   *  on read into [5_000ms, 60min] to defend against bad config.
   *  See docs/mobile-fit-hold.md. */
  mobileAutoRestoreFitMs: number | null
  /** Experimental: persistent terminal pane attention ring for terminal bell
   *  and agent-completion events. Opt-in while the signal/noise balance is
   *  being tested. */
  experimentalTerminalAttention: boolean
  /** Experimental: automatically sleep completed, resumable background agent terminals. */
  experimentalAgentHibernation?: boolean
  /** Milliseconds a completed agent must stay idle before hibernation can be considered. */
  agentHibernationIdleMs?: number
  /** Experimental: per-workspace on-demand environment recipes and setup surface. */
  /** Active non-local runtime environment for client-routed RPC. `null`
   *  preserves the current local desktop behavior. */
  activeRuntimeEnvironmentId?: string | null
  /** AI-generated commit messages: agent + model + per-model thinking +
   *  user-customizable prompt suffix. Optional so existing profiles do not
   *  require a migration step before this feature lands. */
  commitMessageAi?: CommitMessageAiSettings
  /** Source-control AI generation settings for commit messages and hosted-review drafts. */
  sourceControlAi?: SourceControlAiSettings
  /** Anonymous product-telemetry state. Optional because the one-shot
   *  migration in `Store.load()` is what populates it on first boot of the
   *  telemetry release; before migration runs, the field is absent. After
   *  migration every user has `installId` set and `optedIn` is `true` (new
   *  users) or `null` (existing users awaiting the first-launch banner).
   *
   *  Why this block carries only consent + identity state, not volatile
   *  counters: DAU and crash attribution are both out of v1 scope
   *  (daily_active_user is derived server-side from app_opened; crashes are
   *  handled by a separate crash-reporting lane, not product telemetry). So
   *  there is no lastActiveDate, no lastSessionId, and no heartbeat
   *  timestamp here — adding any of those would amplify the debounced
   *  settings write on a fast cadence and couple user preferences to
   *  volatile telemetry counters. Keep this surface to values that only
   *  change on explicit consent transitions. */
  telemetry?: {
    /** New users: initialized to `true` at install.
     *  Existing users: `null` until they resolve the first-launch banner. */
    optedIn: boolean | null
    /** Anonymous UUID v4. Generated on first run. Stable across launches; not surfaced in the UI. */
    installId: string
    /** Cohort marker set once during migration. True for users with a
     *  pre-existing profile (gates the existing-user opt-in banner);
     *  false for fresh installs (no first-launch surface). */
    existedBeforeTelemetryRelease: boolean
  }
}
