export type DiscoveryStatusEmitted = 'found' | 'absent' | 'imported'

import { z } from 'zod'

import {
  cohortSchema,
  hasMatchingOnboardingFeatureSetupSelectedCount,
  onboardingFeatureSetupFeatureSchema,
  onboardingFeatureSetupSelectedCountRefinement,
  onboardingFeatureSetupSelectionSchema
} from './onboarding-foundations'

export const ghosttyDiscoveryStateSchema = z.enum(['found', 'absent', 'imported'])

// Compile-time guard: every member of ghosttyDiscoveryStateSchema must be a
// discovery `status` the renderer can actually emit. Adding a new
// DiscoveryState member in theme-step.tsx without updating the schema (or
// vice versa) breaks the build here rather than silently dropping telemetry.
export type _GhosttyDiscoveryStateSync =
  z.infer<typeof ghosttyDiscoveryStateSchema> extends DiscoveryStatusEmitted
    ? DiscoveryStatusEmitted extends z.infer<typeof ghosttyDiscoveryStateSchema>
      ? true
      : never
    : never
export const _ghosttyDiscoveryStateSyncCheck: _GhosttyDiscoveryStateSync = true
void _ghosttyDiscoveryStateSyncCheck

export const onboardingGhosttyDiscoveredSchema = z
  .object({
    state: ghosttyDiscoveryStateSchema,
    // Bucketed, not raw, count: exact group counts are an environment
    // fingerprint (heavy customizers are uniquely identifiable). Buckets
    // cover the nine possible group labels in `humanFields()` without
    // re-emitting the count itself.
    field_group_count_bucket: z.enum(['0', '1-3', '4-7', '8+']),
    cohort: cohortSchema
  })
  .strict()
export const onboardingGhosttyImportClickedSchema = z.object({ cohort: cohortSchema }).strict()

// Why: smart-sort telemetry. The class distribution event tells us whether
// real users have meaningful Class 1/2/3 populations (signal that the
// redesign is doing work) or whether everyone collapses to Class 4 (signal
// that hook coverage is too low). The Class 1 promotion event distinguishes
// hook-driven attention from the title-heuristic fallback so we can tell
// whether Edge case 9 is carrying weight. The smart→recent switch event is
// our regression signal: users abandoning Smart for Recent.
export const smartSortClassDistributionSchema = z
  .object({
    class_1: z.number().int().nonnegative(),
    class_2: z.number().int().nonnegative(),
    class_3: z.number().int().nonnegative(),
    class_4: z.number().int().nonnegative(),
    total_worktrees: z.number().int().nonnegative()
  })
  .strict()
export const smartSortClass1PromotionSchema = z
  .object({
    cause: z.enum(['blocked', 'waiting', 'title-heuristic'])
  })
  .strict()
// Why a placeholder field instead of `z.object({})`: an empty zod object
// infers as TS `{}` (which in TS means "anything non-null/undefined"). That
// upsets the `keyof EventMap[N]` probes used by COHORT_EXTENDED_SET and
// ONBOARDING_COHORT_SET, breaking their compile-time roster sync checks.
// Carrying a single optional `_v` discriminator dodges the issue and
// preserves room to add future fields without renaming the event.
export const smartToRecentSwitchSchema = z.object({ _v: z.literal(1).optional() }).strict()
export const onboardingGhosttyImportFailedSchema = z
  .object({
    // `'no_config'` is reserved for a future explicit "preview returned
    // found:false" branch. Today's call sites emit `'empty_diff'` (the
    // import resolved to no changes) or `'unknown'` (caught throw).
    reason: z.enum(['no_config', 'empty_diff', 'unknown']),
    cohort: cohortSchema
  })
  .strict()
export const onboardingFeatureSetupToggledSchema = z
  .object({
    feature: onboardingFeatureSetupFeatureSchema,
    selected: z.boolean(),
    cohort: cohortSchema
  })
  .strict()
export const onboardingFeatureSetupRunSchema = z
  .object({
    ...onboardingFeatureSetupSelectionSchema,
    cli_touched: z.boolean(),
    skill_commands_copied: z.boolean(),
    skill_install_command_prepared: z.boolean(),
    computer_use_permissions_opened: z.boolean(),
    warning_count: z.number().int().nonnegative(),
    cohort: cohortSchema
  })
  // Why: selected_count is derived analytics data; validate the relationship
  // at the untrusted IPC boundary instead of trusting renderer callers.
  .refine(
    hasMatchingOnboardingFeatureSetupSelectedCount,
    onboardingFeatureSetupSelectedCountRefinement
  )
  .strict()
export const onboardingFeatureSetupTerminalOpenedSchema = z
  .object({
    ...onboardingFeatureSetupSelectionSchema,
    cohort: cohortSchema
  })
  .refine(
    hasMatchingOnboardingFeatureSetupSelectedCount,
    onboardingFeatureSetupSelectedCountRefinement
  )
  .strict()
export const onboardingFeatureSetupTerminalInteractedSchema = z
  .object({
    ...onboardingFeatureSetupSelectionSchema,
    method: z.enum(['keyboard', 'pointer']),
    cohort: cohortSchema
  })
  .refine(
    hasMatchingOnboardingFeatureSetupSelectedCount,
    onboardingFeatureSetupSelectedCountRefinement
  )
  .strict()

export const onboardingProductTelemetryEventSchemas = {
  onboarding_ghostty_discovered: onboardingGhosttyDiscoveredSchema,
  onboarding_ghostty_import_clicked: onboardingGhosttyImportClickedSchema,
  onboarding_ghostty_import_failed: onboardingGhosttyImportFailedSchema,
  onboarding_feature_setup_toggled: onboardingFeatureSetupToggledSchema,
  onboarding_feature_setup_run: onboardingFeatureSetupRunSchema,
  onboarding_feature_setup_terminal_opened: onboardingFeatureSetupTerminalOpenedSchema,
  onboarding_feature_setup_terminal_interacted: onboardingFeatureSetupTerminalInteractedSchema,
  smart_sort_class_distribution: smartSortClassDistributionSchema,
  smart_sort_class_1_promotion: smartSortClass1PromotionSchema,
  smart_to_recent_switch: smartToRecentSwitchSchema
} as const
