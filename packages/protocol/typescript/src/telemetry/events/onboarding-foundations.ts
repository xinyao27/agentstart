import { z } from 'zod'

import type { OnboardingChecklistState } from '../../settings/onboarding'
import {
  NESTED_REPO_COUNT_BUCKETS,
  NESTED_REPO_IMPORT_ACTIONS,
  NESTED_REPO_IMPORT_OUTCOMES,
  NESTED_REPO_SCAN_RESULTS,
  NESTED_REPO_TELEMETRY_MAX_REPO_COUNT,
  NESTED_REPO_TELEMETRY_RUNTIME_KINDS,
  NESTED_REPO_TELEMETRY_SURFACES,
  bucketNestedRepoTelemetryCount
} from '../nested-repo'
import { nthRepoAddedSchema } from './core'

export const ONBOARDING_TELEMETRY_LEGACY_MAX_STEP = 7
export const onboardingStepSchema = z
  .number()
  .int()
  .min(1)
  .max(ONBOARDING_TELEMETRY_LEGACY_MAX_STEP)
export const onboardingPathSchema = z.enum(['open_folder', 'clone_url', 'add_project_modal'])
export const onboardingFailureReasonSchema = z.enum([
  'invalid_path',
  'clone_failed',
  'cancelled',
  'unknown'
])
export const onboardingValueKindSchema = z.enum([
  'agent',
  'theme',
  'notifications',
  'agent_setup',
  'integrations',
  'windows_terminal',
  'tour',
  'repo'
])
export const onboardingTourOutcomeSchema = z.enum([
  'skipped_intro',
  'started_partial',
  'completed_inline'
])
export const onboardingWindowsTerminalShellSchema = z.enum([
  'powershell',
  'command_prompt',
  'git_bash',
  'wsl',
  'other'
])
export const onboardingWindowsTerminalRightClickSchema = z.enum(['paste', 'menu'])
export const onboardingWindowsTerminalExitActionSchema = z.enum([
  'continue',
  'skip_to_project_setup'
])
// `dismissed` from `OnboardingChecklistState` is intentionally excluded —
// it is a UI panel-visibility flag, not an activation event, so it never
// fires `activation_checklist_item_completed`. Keep this list in sync with
// the activation keys of `OnboardingChecklistState` in settings/onboarding.ts.
export const onboardingChecklistItemSchema = z.enum([
  'addedRepo',
  'addedFolder',
  'choseAgent',
  'ranFirstAgent',
  'ranSecondAgentOnSameTask',
  'triedCmdJ',
  'shapedSidebar',
  'reviewedDiff',
  'openedPr',
  'openedFile',
  'ranAgentOnFile'
])
export const onboardingFeatureSetupFeatureSchema = z.enum([
  'browser_use',
  'computer_use',
  'orchestration'
])
export const onboardingFeatureSetupSelectionSchema = {
  browser_use: z.boolean(),
  computer_use: z.boolean(),
  orchestration: z.boolean(),
  selected_count: z.number().int().min(0).max(3)
} as const
export type OnboardingFeatureSetupSelectionTelemetry = {
  browser_use: boolean
  computer_use: boolean
  orchestration: boolean
  selected_count: number
}
export const onboardingFeatureSetupSelectedCountRefinement = {
  path: ['selected_count'],
  message: 'selected_count must match selected feature flags'
}

export function hasMatchingOnboardingFeatureSetupSelectedCount(
  props: OnboardingFeatureSetupSelectionTelemetry
): boolean {
  const selectedCount =
    (props.browser_use ? 1 : 0) + (props.computer_use ? 1 : 0) + (props.orchestration ? 1 : 0)
  return props.selected_count === selectedCount
}

// Why: compile-time guard that the enum above stays in lockstep with the
// activation keys of OnboardingChecklistState (everything except the UI-only
// `dismissed` flag). Adding/removing a checklist key without updating this
// schema breaks the build here rather than silently dropping telemetry.
export type _OnboardingChecklistItemSync =
  z.infer<typeof onboardingChecklistItemSchema> extends Exclude<
    keyof OnboardingChecklistState,
    'dismissed'
  >
    ? Exclude<keyof OnboardingChecklistState, 'dismissed'> extends z.infer<
        typeof onboardingChecklistItemSchema
      >
      ? true
      : never
    : never
export const _onboardingChecklistItemSyncCheck: _OnboardingChecklistItemSync = true
void _onboardingChecklistItemSyncCheck

// Cohort discriminator threaded onto every onboarding-wizard event by the
// IPC `telemetry:track` handler (mirrors `nth_repo_added`). `.optional()` is
// load-bearing: the classifier returns `undefined` when settings can't be
// read, and `.strict()` would otherwise reject the event entirely.
//
// Adding a new onboarding event: include `cohort: cohortSchema` on its
// schema. The injection set in `telemetry:track` is derived from
// `'cohort' in schema.shape`, so there is no parallel hand-maintained list.
export const cohortSchema = z.enum(['fresh_install', 'upgrade_backfill']).optional()

export const nestedRepoTelemetrySurfaceSchema = z.enum(NESTED_REPO_TELEMETRY_SURFACES)
export const nestedRepoTelemetryRuntimeKindSchema = z.enum(NESTED_REPO_TELEMETRY_RUNTIME_KINDS)
export const nestedRepoCountSchema = z
  .number()
  .int()
  .min(0)
  .max(NESTED_REPO_TELEMETRY_MAX_REPO_COUNT)
export const nestedRepoCountBucketSchema = z.enum(NESTED_REPO_COUNT_BUCKETS)
export const nestedRepoScanResultSchema = z.enum(NESTED_REPO_SCAN_RESULTS)
export const nestedRepoImportActionSchema = z.enum(NESTED_REPO_IMPORT_ACTIONS)
export const nestedRepoImportOutcomeSchema = z.enum(NESTED_REPO_IMPORT_OUTCOMES)
export const nestedRepoScanPathKindSchema = z.enum(['git_repo', 'non_git_folder'])
export const nestedRepoImportModeSchema = z.enum(['group', 'separate'])
export const nestedRepoAttemptIdSchema = z.string().uuid()

export function validateNestedRepoCountBucket(
  props: Record<string, unknown>,
  countKey: string,
  bucketKey: string,
  ctx: z.RefinementCtx
): void {
  const count = props[countKey]
  const bucket = props[bucketKey]
  if (typeof count !== 'number' || typeof bucket !== 'string') {
    return
  }
  if (bucketNestedRepoTelemetryCount(count) !== bucket) {
    ctx.addIssue({
      code: 'custom',
      path: [bucketKey],
      message: `${bucketKey} must match ${countKey}`
    })
  }
}

export function validateNestedRepoCountBuckets(
  props: Record<string, unknown>,
  ctx: z.RefinementCtx
): void {
  validateNestedRepoCountBucket(props, 'found_count', 'found_count_bucket', ctx)
  validateNestedRepoCountBucket(props, 'selected_count', 'selected_count_bucket', ctx)
  validateNestedRepoCountBucket(props, 'imported_count', 'imported_count_bucket', ctx)
  validateNestedRepoCountBucket(props, 'already_known_count', 'already_known_count_bucket', ctx)
  validateNestedRepoCountBucket(props, 'failed_count', 'failed_count_bucket', ctx)
}

export const nestedRepoTelemetryBaseSchema = {
  // Why: high-cardinality by design, but random and non-persistent. It lets
  // dashboards count scan -> action -> result attempts without path-derived IDs.
  attempt_id: nestedRepoAttemptIdSchema,
  surface: nestedRepoTelemetrySurfaceSchema,
  runtime_kind: nestedRepoTelemetryRuntimeKindSchema,
  nth_repo_added: nthRepoAddedSchema
} as const

export const addRepoNestedScanResultSchema = z
  .object({
    ...nestedRepoTelemetryBaseSchema,
    result: nestedRepoScanResultSchema,
    selected_path_kind: nestedRepoScanPathKindSchema.optional(),
    found_count: nestedRepoCountSchema,
    found_count_bucket: nestedRepoCountBucketSchema,
    truncated: z.boolean(),
    timed_out: z.boolean()
  })
  .strict()
  .superRefine(validateNestedRepoCountBuckets)

export const addRepoNestedImportActionSchema = z
  .object({
    ...nestedRepoTelemetryBaseSchema,
    action: nestedRepoImportActionSchema,
    found_count: nestedRepoCountSchema,
    found_count_bucket: nestedRepoCountBucketSchema,
    selected_count: nestedRepoCountSchema,
    selected_count_bucket: nestedRepoCountBucketSchema,
    all_selected: z.boolean()
  })
  .strict()
  .superRefine(validateNestedRepoCountBuckets)

export const addRepoNestedImportResultSchema = z
  .object({
    ...nestedRepoTelemetryBaseSchema,
    mode: nestedRepoImportModeSchema,
    outcome: nestedRepoImportOutcomeSchema,
    found_count: nestedRepoCountSchema,
    found_count_bucket: nestedRepoCountBucketSchema,
    selected_count: nestedRepoCountSchema,
    selected_count_bucket: nestedRepoCountBucketSchema,
    imported_count: nestedRepoCountSchema,
    imported_count_bucket: nestedRepoCountBucketSchema,
    already_known_count: nestedRepoCountSchema,
    already_known_count_bucket: nestedRepoCountBucketSchema,
    failed_count: nestedRepoCountSchema,
    failed_count_bucket: nestedRepoCountBucketSchema,
    all_selected: z.boolean()
  })
  .strict()
  .superRefine(validateNestedRepoCountBuckets)

// `'button' | 'keyboard'` records whether the user advanced via a footer
// button click, Cmd/Ctrl+Enter, or an equivalent keyboard exit like Escape.
// The uniform shape lets keyboard skip/dismiss paths arrive without a
// schema migration.
export const advancedViaSchema = z.enum(['button', 'keyboard']).optional()

export const nestedRepoTelemetryEventSchemas = {
  add_repo_nested_scan_result: addRepoNestedScanResultSchema,
  add_repo_nested_import_action: addRepoNestedImportActionSchema,
  add_repo_nested_import_result: addRepoNestedImportResultSchema
} as const
