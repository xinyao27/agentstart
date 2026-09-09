import { z } from 'zod'

import {
  CONTEXTUAL_TOUR_OUTCOMES,
  FEATURE_EDUCATION_CONTEXTUAL_TOUR_IDS,
  FEATURE_EDUCATION_SOURCES,
  SETUP_GUIDE_CLOSE_OUTCOMES,
  SETUP_GUIDE_SOURCES,
  TERMINAL_PANE_SPLIT_SOURCES
} from '../education'
import { FEATURE_WALL_SETUP_STEP_IDS } from '../feature-wall/types'

export const featureEducationSourceSchema = z.enum(FEATURE_EDUCATION_SOURCES)
export const featureEducationContextualTourIdSchema = z.enum(FEATURE_EDUCATION_CONTEXTUAL_TOUR_IDS)
export const setupGuideSourceSchema = z.enum(SETUP_GUIDE_SOURCES)
export const setupGuideCloseOutcomeSchema = z.enum(SETUP_GUIDE_CLOSE_OUTCOMES)
export const setupGuideStepIdSchema = z.enum(FEATURE_WALL_SETUP_STEP_IDS)
export const setupGuideStepIdOrNoneSchema = z.enum([
  ...FEATURE_WALL_SETUP_STEP_IDS,
  'none'
] as const)
export const terminalPaneSplitSourceSchema = z.enum(TERMINAL_PANE_SPLIT_SOURCES)

export const contextualTourShownSchema = z
  .object({
    tour_id: featureEducationContextualTourIdSchema,
    source: featureEducationSourceSchema,
    was_feature_previously_interacted: z.boolean()
  })
  .strict()

export const contextualTourOutcomeSchema = z
  .object({
    tour_id: featureEducationContextualTourIdSchema,
    source: featureEducationSourceSchema,
    outcome: z.enum(CONTEXTUAL_TOUR_OUTCOMES),
    steps_seen: z.number().int().min(0).max(8),
    total_steps: z.number().int().min(1).max(8),
    furthest_step_index: z.number().int().min(1).max(8).optional(),
    defined_step_count: z.number().int().min(1).max(8).optional()
  })
  .refine((payload) => payload.steps_seen <= payload.total_steps, {
    message: 'steps_seen must be less than or equal to total_steps',
    path: ['steps_seen']
  })
  .refine(
    (payload) =>
      payload.furthest_step_index === undefined ||
      payload.defined_step_count === undefined ||
      payload.furthest_step_index <= payload.defined_step_count,
    {
      message: 'furthest_step_index must be less than or equal to defined_step_count',
      path: ['furthest_step_index']
    }
  )
  .refine(
    (payload) =>
      (payload.furthest_step_index === undefined) === (payload.defined_step_count === undefined),
    {
      message: 'furthest_step_index and defined_step_count must be sent together',
      path: ['defined_step_count']
    }
  )
  .strict()

export const setupGuideOpenedSchema = z
  .object({
    source: setupGuideSourceSchema,
    initial_completed_count: z.number().int().min(0).max(8),
    total_steps: z.literal(8),
    first_incomplete_step_id: setupGuideStepIdOrNoneSchema
  })
  .strict()

export const setupGuideClosedSchema = z
  .object({
    source: setupGuideSourceSchema,
    outcome: setupGuideCloseOutcomeSchema,
    initial_completed_count: z.number().int().min(0).max(8),
    final_completed_count: z.number().int().min(0).max(8),
    total_steps: z.literal(8),
    active_step_id: setupGuideStepIdOrNoneSchema
  })
  .refine((payload) => payload.final_completed_count >= payload.initial_completed_count, {
    message: 'final_completed_count must be greater than or equal to initial_completed_count',
    path: ['final_completed_count']
  })
  .strict()

export const setupGuideStepCompletedSchema = z
  .object({
    step_id: setupGuideStepIdSchema,
    section_id: z.enum(['parallel-work', 'setup']),
    completed_count: z.number().int().min(1).max(8),
    total_steps: z.literal(8),
    setup_guide_visible: z.boolean()
  })
  .strict()

export const terminalPaneSplitSchema = z
  .object({
    source: terminalPaneSplitSourceSchema,
    direction: z.enum(['vertical', 'horizontal'])
  })
  .strict()

// Why: measures the changed-on-disk conflict flow (issue #7265) — how often
// conflicts surface per transport (false-banner detection on ssh/runtime
// echoes) and which resolution users pick. Deliberately path-free.
export const editorExternalChangeConflictShownSchema = z
  .object({
    surface: z.enum(['edit', 'unstaged-diff']),
    transport: z.enum(['local', 'ssh', 'runtime']),
    origin: z.enum(['live', 'restore'])
  })
  .strict()

export const editorExternalChangeConflictActionSchema = z
  .object({
    action: z.enum(['reload', 'keep', 'compare', 'undo_reload', 'save_overwrite']),
    surface: z.enum(['edit', 'unstaged-diff']),
    transport: z.enum(['local', 'ssh', 'runtime'])
  })
  .strict()

// Support reports are deliberately separate from product analytics: they are
// sent only after an explicit user action and use a report-scoped distinct ID.
// Free-form fields are allowed here, but their hard caps keep one PostHog event
// small enough for reliable ingestion and force producers to redact first.
export const SUPPORT_REPORT_TEXT_MAX_LENGTH = 8_000
export const SUPPORT_REPORT_DIAGNOSTIC_EXCERPT_MAX_LENGTH = 16_000
export const SUPPORT_REPORT_GITHUB_LOGIN_MAX_LENGTH = 128
export const SUPPORT_REPORT_GITHUB_EMAIL_MAX_LENGTH = 254

export const supportReportSubmittedSchema = z
  .object({
    report_id: z.string().uuid(),
    report_type: z.enum(['feedback', 'crash', 'diagnostics']),
    report_text: z.string().min(1).max(SUPPORT_REPORT_TEXT_MAX_LENGTH).optional(),
    submit_anonymously: z.boolean(),
    github_login: z.string().min(1).max(SUPPORT_REPORT_GITHUB_LOGIN_MAX_LENGTH).optional(),
    github_email: z.string().min(1).max(SUPPORT_REPORT_GITHUB_EMAIL_MAX_LENGTH).optional(),
    app_version: z.string().max(64),
    platform: z.string().max(64),
    arch: z.string().max(64),
    os_release: z.string().max(64),
    yiru_channel: z.enum(['stable', 'rc']),
    diagnostic_bundle_id: z
      .string()
      .regex(/^[A-Za-z0-9_-]{16,64}$/)
      .optional(),
    diagnostic_excerpt: z
      .string()
      .min(1)
      .max(SUPPORT_REPORT_DIAGNOSTIC_EXCERPT_MAX_LENGTH)
      .optional(),
    diagnostic_bytes: z
      .number()
      .int()
      .min(0)
      .max(4 * 1024 * 1024)
      .optional(),
    diagnostic_span_count: z.number().int().min(0).max(1_000_000).optional(),
    diagnostic_excerpt_truncated: z.boolean().optional()
  })
  .strict()
  .superRefine((props, ctx) => {
    const diagnosticKeys = [
      props.diagnostic_bundle_id,
      props.diagnostic_excerpt,
      props.diagnostic_bytes,
      props.diagnostic_span_count,
      props.diagnostic_excerpt_truncated
    ]
    const diagnosticFieldCount = diagnosticKeys.filter((value) => value !== undefined).length
    if (diagnosticFieldCount !== 0 && diagnosticFieldCount !== diagnosticKeys.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['diagnostic_excerpt'],
        message: 'diagnostic report fields must be provided together'
      })
    }
    if (props.report_type === 'diagnostics' && diagnosticFieldCount !== diagnosticKeys.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['diagnostic_excerpt'],
        message: 'diagnostics reports require a bounded excerpt and metadata'
      })
    }
    if (props.report_type !== 'diagnostics' && !props.report_text) {
      ctx.addIssue({
        code: 'custom',
        path: ['report_text'],
        message: 'feedback and crash reports require report text'
      })
    }
    if (props.report_type === 'feedback' && diagnosticFieldCount !== 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['diagnostic_excerpt'],
        message: 'feedback reports cannot include diagnostics'
      })
    }
    if (props.submit_anonymously && (props.github_login || props.github_email)) {
      ctx.addIssue({
        code: 'custom',
        path: ['submit_anonymously'],
        message: 'anonymous reports cannot include GitHub identity'
      })
    }
  })

export const directSshReconnectCountSchema = z.number().int().min(0).max(1_000_000)
export const directSshReconnectDurationSchema = z.number().int().min(0).max(86_400_000)
export const directSshReconnectOperationSchema = z
  .object({
    mode: z.enum(['reconnect', 'prepare_only']),
    reason: z.enum(['reconnect', 'initial_hydration', 'workspace_snapshot', 'wake_refresh']),
    outcome: z.enum(['complete', 'degraded', 'canceled', 'stale', 'stopped', 'stabilizing']),
    terminal_retried_count: directSshReconnectCountSchema,
    terminal_stale_binding_cleared_count: directSshReconnectCountSchema,
    terminal_correction_succeeded_count: directSshReconnectCountSchema,
    catalog_complete_count: directSshReconnectCountSchema,
    catalog_degraded_count: directSshReconnectCountSchema,
    catalog_stale_count: directSshReconnectCountSchema,
    repo_complete_count: directSshReconnectCountSchema,
    repo_non_authoritative_count: directSshReconnectCountSchema,
    repo_retrying_count: directSshReconnectCountSchema,
    repo_timed_out_count: directSshReconnectCountSchema,
    repo_cancel_budget_exhausted_count: directSshReconnectCountSchema,
    repo_canceled_count: directSshReconnectCountSchema,
    repo_stale_count: directSshReconnectCountSchema,
    repo_rejected_count: directSshReconnectCountSchema,
    lineage_complete_count: directSshReconnectCountSchema,
    lineage_degraded_count: directSshReconnectCountSchema,
    lineage_canceled_count: directSshReconnectCountSchema,
    lineage_stale_count: directSshReconnectCountSchema,
    lineage_not_started_count: directSshReconnectCountSchema,
    git_worktree_count: directSshReconnectCountSchema,
    folder_workspace_count: directSshReconnectCountSchema,
    ambiguous_owner_count: directSshReconnectCountSchema,
    contradictory_owner_count: directSshReconnectCountSchema,
    total_duration_ms: directSshReconnectDurationSchema,
    terminal_finalization_duration_ms: directSshReconnectDurationSchema,
    catalog_duration_ms: directSshReconnectDurationSchema,
    queue_wait_sample_count: directSshReconnectCountSchema,
    queue_wait_duration_ms_p50: directSshReconnectDurationSchema,
    queue_wait_duration_ms_p95: directSshReconnectDurationSchema,
    queue_wait_duration_ms_p99: directSshReconnectDurationSchema,
    queue_wait_duration_ms_max: directSshReconnectDurationSchema,
    provider_execution_sample_count: directSshReconnectCountSchema,
    provider_execution_duration_ms_p50: directSshReconnectDurationSchema,
    provider_execution_duration_ms_p95: directSshReconnectDurationSchema,
    provider_execution_duration_ms_p99: directSshReconnectDurationSchema,
    provider_execution_duration_ms_max: directSshReconnectDurationSchema,
    timeout_retry_count: directSshReconnectCountSchema,
    locally_settled_waiter_count: directSshReconnectCountSchema,
    cancel_debt_count: directSshReconnectCountSchema,
    replacement_admission_delayed_count: directSshReconnectCountSchema,
    overlapping_join_count: directSshReconnectCountSchema,
    coordinator_owned_direct_ssh_detected_worktree_concurrency_peak:
      directSshReconnectCountSchema.max(5),
    estimated_late_work_allowance_count: directSshReconnectCountSchema.max(2),
    authority_rotation_count: directSshReconnectCountSchema,
    damped_preparation_count: directSshReconnectCountSchema
  })
  .strict()

// ── Event registry: the one record the validator consumes ───────────────
//
// The validator does `eventSchemas[name].safeParse(props)`. `EventMap` is
// `z.infer`-derived from this record, so there is exactly one source of
// truth for both compile-time types and runtime validation.
//
// Schema-evolution / versioning doctrine:
// Breaking changes (renaming a field, changing an enum's meaning, removing a
// required key) require a new event name (e.g. `agent_started_v2`), not an
// in-place edit. Additive-optional fields (`z.field().optional()`) are safe
// to add in place. This keeps PostHog funnels clean — an in-place breaking
// change silently blends pre- and post-change rows under one event name,
// which cannot be unmixed after the fact.

export const productTelemetryEventSchemas = {
  contextual_tour_shown: contextualTourShownSchema,
  contextual_tour_outcome: contextualTourOutcomeSchema,
  setup_guide_opened: setupGuideOpenedSchema,
  setup_guide_closed: setupGuideClosedSchema,
  setup_guide_step_completed: setupGuideStepCompletedSchema,
  terminal_pane_split: terminalPaneSplitSchema,
  editor_external_change_conflict_shown: editorExternalChangeConflictShownSchema,
  editor_external_change_conflict_action: editorExternalChangeConflictActionSchema,
  support_report_submitted: supportReportSubmittedSchema,
  direct_ssh_reconnect_operation: directSshReconnectOperationSchema
} as const
