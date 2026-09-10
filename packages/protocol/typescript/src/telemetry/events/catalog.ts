import { z } from 'zod'

import { coreTelemetryEventSchemas } from './core'
import { nestedRepoTelemetryEventSchemas, type cohortSchema } from './onboarding-foundations'
import { onboardingJourneyTelemetryEventSchemas } from './onboarding-journey'
import { onboardingProductTelemetryEventSchemas } from './onboarding-product'
import { productTelemetryEventSchemas } from './product'
import { repoSetupTelemetryEventSchemas } from './repo-setup'

export const eventSchemas = {
  ...coreTelemetryEventSchemas,
  ...repoSetupTelemetryEventSchemas,
  ...nestedRepoTelemetryEventSchemas,
  ...onboardingJourneyTelemetryEventSchemas,
  ...onboardingProductTelemetryEventSchemas,
  ...productTelemetryEventSchemas
} as const

export type EventMap = { [N in keyof typeof eventSchemas]: z.infer<(typeof eventSchemas)[N]> }
export type EventName = keyof EventMap
export type EventProps<N extends EventName> = EventMap[N]
export type SupportReportDraft = Omit<
  EventProps<'support_report_submitted'>,
  'report_id' | 'app_version' | 'platform' | 'arch' | 'os_release' | 'agentstart_channel'
>

// Why: events whose schemas declare a given property name. Extracted so the
// cast (Object.entries → [EventName, ZodTypeAny]) stays in one place; if the
// schema-registry shape ever changes, only one site needs to update.
// Safely skips non-`ZodObject` schemas (e.g. a future `z.discriminatedUnion`
// or `z.union`) — those have no `.shape`, and probing `key in undefined`
// would throw at module load and take the telemetry module down on import.
function eventSchemaShape(schema: z.ZodTypeAny): z.ZodRawShape | null {
  if (schema instanceof z.ZodObject) {
    return schema.shape
  }

  const shapeBearingSchema = schema as { shape?: unknown }
  // Why: refined object schemas may still expose `.shape` even if a Zod
  // version stops preserving `instanceof ZodObject` through refinement.
  if (shapeBearingSchema.shape && typeof shapeBearingSchema.shape === 'object') {
    return shapeBearingSchema.shape as z.ZodRawShape
  }
  return null
}

function eventsWithShapeKey(key: string): ReadonlySet<EventName> {
  return new Set(
    (Object.entries(eventSchemas) as [EventName, z.ZodTypeAny][])
      .filter(([, schema]) => {
        const shape = eventSchemaShape(schema)
        return shape !== null && key in shape
      })
      .map(([name]) => name)
  )
}

// Events whose schemas declare `nth_repo_added`. Derived from `eventSchemas`
// at module load by probing each schema's `.shape` — there is no parallel
// hand-maintained list to drift out of sync. The IPC `telemetry:track`
// handler injects the cohort property only when the incoming event name is
// in this set: the schemas are `.strict()`, so injecting `nth_repo_added`
// on an event whose schema does not declare it would fail validation and
// silently drop the entire event.
//
// Schema-additions checklist for adding a new cohort-extended event:
//   add `nth_repo_added: nthRepoAddedSchema` to the event's schema above.
//   That is the *only* step — this set updates automatically.
const COHORT_EXTENDED_SET = eventsWithShapeKey('nth_repo_added')

// Compile-time roster of events that must declare `nth_repo_added`. Same
// rationale as `_OnboardingCohortRosterSync` below — guards the runtime
// injection set against silent schema drift.
type _CohortExtendedRoster =
  | 'app_opened'
  | 'app_starred_agentstart'
  | 'star_nag_outcome'
  | 'feature_interaction_usage_bucket_reached'
  | 'repo_added'
  | 'add_repo_setup_step_action'
  | 'add_repo_existing_workspaces_detected'
  | 'add_repo_default_checkout_handoff'
  | 'add_repo_nested_scan_result'
  | 'add_repo_nested_import_action'
  | 'add_repo_nested_import_result'
  | 'workspace_created'
  | 'workspace_create_failed'
  | 'setup_script_prompt_shown'
  | 'setup_script_prompt_action'
  | 'agent_started'
  | 'agent_prompt_sent'
  | 'agent_error'
  | 'agentstart_cli_feature_tip_shown'
  | 'agentstart_cli_feature_tip_setup_clicked'
  | 'agentstart_cli_feature_tip_setup_result'
  | 'command_palette_feature_tip_shown'
  | 'command_palette_feature_tip_acknowledged'
// Why: `z.object({}).strict()` infers a string index signature, which would
// make every key appear present. Ignore index-signature-only keys here so
// strict empty event payloads do not get pulled into keyed telemetry rosters.
type _KnownPayloadKeys<T> = string extends keyof T ? never : keyof T
type _DerivedCohortExtendedEvents = {
  [N in EventName]: 'nth_repo_added' extends _KnownPayloadKeys<EventMap[N]> ? N : never
}[EventName]
type _CohortExtendedRosterSync = _CohortExtendedRoster extends _DerivedCohortExtendedEvents
  ? _DerivedCohortExtendedEvents extends _CohortExtendedRoster
    ? true
    : never
  : never
const _cohortExtendedRosterSyncCheck: _CohortExtendedRosterSync = true
void _cohortExtendedRosterSyncCheck

export function isCohortExtendedEvent(name: EventName): boolean {
  return COHORT_EXTENDED_SET.has(name)
}

// Onboarding events — derived the same way as `COHORT_EXTENDED_SET`: probe
// each schema's `.shape` for the `cohort` key. The IPC `telemetry:track`
// handler injects the onboarding cohort property only when the incoming
// event name is in this set; schemas are `.strict()`, so injecting `cohort`
// on an event whose schema does not declare it would fail validation and
// silently drop the entire event.
//
// Adding a new onboarding event: include `cohort: cohortSchema` on its
// schema. This set updates automatically.
const ONBOARDING_COHORT_SET = eventsWithShapeKey('cohort')
// `NonNullable` strips `undefined` introduced by `cohortSchema`'s `.optional()`.
export type OnboardingCohort = NonNullable<z.infer<typeof cohortSchema>>

// Compile-time roster of events that must declare `cohort`. If a schema
// refactor drops the field from one of these, this fails tsc rather than
// silently dropping the event from the runtime injection set above (which
// the `.optional()` schema would tolerate without any test failure).
//
// Adding a new onboarding event: add its name here AND declare
// `cohort: cohortSchema` on its schema. Both are required.
type _OnboardingCohortRoster =
  | 'onboarding_started'
  | 'onboarding_step_viewed'
  | 'onboarding_step_completed'
  | 'onboarding_step_skipped'
  | 'onboarding_tour_outcome'
  | 'onboarding_step4_path_clicked'
  | 'onboarding_step4_path_failed'
  | 'onboarding_windows_terminal_snapshot'
  | 'onboarding_completed'
  | 'onboarding_dismissed'
  | 'onboarding_agent_picked'
  | 'onboarding_ghostty_discovered'
  | 'onboarding_ghostty_import_clicked'
  | 'onboarding_ghostty_import_failed'
  | 'onboarding_feature_setup_toggled'
  | 'onboarding_feature_setup_run'
  | 'onboarding_feature_setup_terminal_opened'
  | 'onboarding_feature_setup_terminal_interacted'
type _DerivedOnboardingCohortEvents = {
  [N in EventName]: 'cohort' extends _KnownPayloadKeys<EventMap[N]> ? N : never
}[EventName]
type _OnboardingCohortRosterSync = _OnboardingCohortRoster extends _DerivedOnboardingCohortEvents
  ? _DerivedOnboardingCohortEvents extends _OnboardingCohortRoster
    ? true
    : never
  : never
const _onboardingCohortRosterSyncCheck: _OnboardingCohortRosterSync = true
void _onboardingCohortRosterSyncCheck

export function isOnboardingEvent(name: EventName): boolean {
  return ONBOARDING_COHORT_SET.has(name)
}

// Common props attached by the client — declared here so the validator knows
// which keys to allow on every outgoing event.
//
// No `env: 'prod' | 'dev'` property. Every transmitted event is by
// construction from an official CI build, so a wire discriminator would be
// redundant. Contributor / `pnpm dev` builds do not transmit at all; they
// console-mirror.
//
// Every string field carries the 64-char cap directly — this is what the
// validator's "string-length cap" rule is made of; there is no separate
// post-parse length check to keep in sync with the schema.
export const commonPropsSchema = z
  .object({
    app_version: z.string().max(64),
    platform: z.string().max(64),
    arch: z.string().max(64),
    os_release: z.string().max(64),
    // `install_id` is used as PostHog's `distinctId` and `session_id` is the
    // per-process correlation key — an empty string on either would collapse
    // unrelated events into a single synthetic "user" / "session" and
    // silently corrupt analytics. `.min(1)` rejects that actual observed
    // failure mode without pinning the shape to UUIDs (both ids come from
    // `randomUUID()` today, but forward-compatibility with a future id
    // scheme is cheap to preserve).
    install_id: z.string().min(1).max(64),
    session_id: z.string().min(1).max(64),
    agentstart_channel: z.enum(['stable', 'rc'])
  })
  .strict()
export type CommonProps = z.infer<typeof commonPropsSchema>
