import { z } from 'zod'

import type { PathSource, ShellHydrationFailureReason } from '../../host/shell-environment'
import { FEATURE_WALL_MAX_DWELL_MS } from '../feature-wall/dwell'
import { agentKindSchema, featureWallTourDepthStepSchema } from './foundations'
import {
  advancedViaSchema,
  cohortSchema,
  onboardingChecklistItemSchema,
  onboardingFailureReasonSchema,
  onboardingPathSchema,
  onboardingStepSchema,
  onboardingTourOutcomeSchema,
  onboardingValueKindSchema,
  onboardingWindowsTerminalExitActionSchema,
  onboardingWindowsTerminalRightClickSchema,
  onboardingWindowsTerminalShellSchema
} from './onboarding-foundations'

export const onboardingStartedSchema = z
  .object({ resumed_from_step: onboardingStepSchema.optional(), cohort: cohortSchema })
  .strict()
export const onboardingStepViewedSchema = z
  .object({
    step: onboardingStepSchema,
    value_kind: onboardingValueKindSchema,
    cohort: cohortSchema
  })
  .strict()
export const onboardingStepCompletedSchema = z
  .object({
    step: onboardingStepSchema,
    value_kind: onboardingValueKindSchema,
    duration_ms: z.number().int().nonnegative().optional(),
    advanced_via: advancedViaSchema,
    cohort: cohortSchema
  })
  .strict()
export const onboardingStepSkippedSchema = z
  .object({
    step: onboardingStepSchema,
    value_kind: onboardingValueKindSchema,
    duration_ms: z.number().int().nonnegative().optional(),
    advanced_via: advancedViaSchema,
    cohort: cohortSchema
  })
  .strict()
export type OnboardingTourOutcomeTelemetry = {
  outcome: z.infer<typeof onboardingTourOutcomeSchema>
  tour_dwell_ms?: number
  furthest_step?: z.infer<typeof featureWallTourDepthStepSchema>
  visited_workflow_count?: number
  visited_substep_count?: number
  completed_workflow_count?: number
  completed_substep_count?: number
}

export function validateOnboardingTourOutcome(
  props: OnboardingTourOutcomeTelemetry,
  ctx: z.RefinementCtx
): void {
  if (props.outcome !== 'skipped_intro') {
    return
  }
  for (const key of [
    'tour_dwell_ms',
    'furthest_step',
    'visited_workflow_count',
    'visited_substep_count',
    'completed_workflow_count',
    'completed_substep_count'
  ] as const) {
    if (props[key] !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `${key} is only valid after the inline tour starts`
      })
    }
  }
}

export const onboardingTourOutcomeEventSchema = z
  .object({
    outcome: onboardingTourOutcomeSchema,
    intro_duration_ms: z.number().int().min(0).max(FEATURE_WALL_MAX_DWELL_MS).optional(),
    tour_dwell_ms: z.number().int().min(0).max(FEATURE_WALL_MAX_DWELL_MS).optional(),
    furthest_step: featureWallTourDepthStepSchema.optional(),
    visited_workflow_count: z.number().int().min(0).max(5).optional(),
    visited_substep_count: z.number().int().min(0).max(9).optional(),
    completed_workflow_count: z.number().int().min(0).max(5).optional(),
    completed_substep_count: z.number().int().min(0).max(9).optional(),
    advanced_via: advancedViaSchema,
    cohort: cohortSchema
  })
  .strict()
  .superRefine(validateOnboardingTourOutcome)
export const onboardingStep4PathClickedSchema = z
  .object({ path: onboardingPathSchema, cohort: cohortSchema })
  .strict()
export const onboardingStep4PathFailedSchema = z
  .object({
    path: onboardingPathSchema,
    reason: onboardingFailureReasonSchema,
    cohort: cohortSchema
  })
  .strict()
export const onboardingWindowsTerminalSnapshotSchema = z
  .object({
    default_shell: onboardingWindowsTerminalShellSchema,
    right_click_behavior: onboardingWindowsTerminalRightClickSchema,
    exit_action: onboardingWindowsTerminalExitActionSchema,
    duration_ms: z.number().int().nonnegative().optional(),
    advanced_via: advancedViaSchema,
    cohort: cohortSchema
  })
  .strict()
// Why: no `is_git_repo` here; the signal moved to `repo_added.is_git_repo`.
export const onboardingCompletedSchema = z
  .object({
    path: onboardingPathSchema,
    total_duration_ms: z.number().int().nonnegative(),
    cohort: cohortSchema
  })
  .strict()
export const onboardingDismissedSchema = z
  .object({
    last_step: onboardingStepSchema,
    duration_ms: z.number().int().nonnegative().optional(),
    advanced_via: advancedViaSchema,
    cohort: cohortSchema
  })
  .strict()
export const activationChecklistItemCompletedSchema = z
  .object({
    item: onboardingChecklistItemSchema,
    time_since_completed_ms: z.number().int().nonnegative()
  })
  .strict()

// Why: see docs/agent-on-path-detection.md. Disambiguates `on_path: false`
// rows on dashboard 1562016 — distinguishes shell-hydration failure (where
// `on_path` is misleading because AgentStart's view of PATH is incomplete) from
// genuinely-not-on-PATH (where the field is reporting accurately). Closed
// enum kept in lockstep with `ShellHydrationFailureReason` via a compile-time
// guard below.
export const pathSourceSchema = z.enum(['shell_hydrate', 'sync_seed_only'])
export const pathFailureReasonSchema = z.enum([
  'none',
  'no_shell',
  'timeout',
  'spawn_error',
  'empty_path'
])

// Compile-time guard: schema enum must match `ShellHydrationFailureReason`.
// Adding a new failure mode in `hydrate-shell-path.ts` without updating both
// the shared alias and this schema breaks the build here. Without the guard,
// a new enum value would ship `failureReason` strings the strict validator
// rejects, dropping the entire `onboarding_agent_picked` event at parse time
// and losing the `agent_kind`/`on_path` data on that pick.
export type _PathFailureReasonSync =
  z.infer<typeof pathFailureReasonSchema> extends ShellHydrationFailureReason
    ? ShellHydrationFailureReason extends z.infer<typeof pathFailureReasonSchema>
      ? true
      : never
    : never
export const _pathFailureReasonSyncCheck: _PathFailureReasonSync = true
void _pathFailureReasonSyncCheck

export type _PathSourceSync =
  z.infer<typeof pathSourceSchema> extends PathSource
    ? PathSource extends z.infer<typeof pathSourceSchema>
      ? true
      : never
    : never
export const _pathSourceSyncCheck: _PathSourceSync = true
void _pathSourceSyncCheck

// Fired at click time from `setSelectedAgentInteractive` so we capture
// mind-changes within the step rather than just the final pick. `agent_kind`
// uses `tuiAgentToAgentKind` so the wire enum stays closed even when stale
// persisted settings present a string outside `TuiAgent` (the fallback is
// `'other'`).
export const onboardingAgentPickedSchema = z
  .object({
    agent_kind: agentKindSchema,
    on_path: z.boolean(),
    detected_count: z.number().int().nonnegative(),
    // `'pending'` when the merged isDetectingAgents/isRefreshingAgents flag
    // is truthy at click time — distinguishes "picked the only detected
    // agent" from "picked before detection finished."
    detection_state: z.enum(['complete', 'pending']),
    // `true` when the selected agent lived under the `<details>` disclosure
    // ("Show N more"). Signals whether users go looking for less-popular
    // agents — input for catalog ordering decisions.
    from_collapsed_section: z.boolean(),
    // Why: instrumentation for the `on_path:false` triage. `.optional()` is
    // load-bearing — events emitted before this deploy validate cleanly under
    // `.strict()`. See docs/agent-on-path-detection.md.
    path_source: pathSourceSchema.optional(),
    path_failure_reason: pathFailureReasonSchema.optional(),
    cohort: cohortSchema
  })
  .strict()

// Mirrors the renderer's DiscoveryState taxonomy in theme-step.tsx. `failed`
// is intentionally NOT a discovery state — it is the outcome of an Import
// attempt, reported by `onboarding_ghostty_import_failed`.

export const onboardingJourneyTelemetryEventSchemas = {
  onboarding_started: onboardingStartedSchema,
  onboarding_step_viewed: onboardingStepViewedSchema,
  onboarding_step_completed: onboardingStepCompletedSchema,
  onboarding_step_skipped: onboardingStepSkippedSchema,
  onboarding_tour_outcome: onboardingTourOutcomeEventSchema,
  onboarding_step4_path_clicked: onboardingStep4PathClickedSchema,
  onboarding_step4_path_failed: onboardingStep4PathFailedSchema,
  onboarding_windows_terminal_snapshot: onboardingWindowsTerminalSnapshotSchema,
  onboarding_completed: onboardingCompletedSchema,
  onboarding_dismissed: onboardingDismissedSchema,
  onboarding_agent_picked: onboardingAgentPickedSchema,
  activation_checklist_item_completed: activationChecklistItemCompletedSchema
} as const
