import { z } from 'zod'

import { FEATURE_WALL_MAX_DWELL_MS } from '../feature-wall/dwell'
import { FEATURE_INTERACTION_IDS } from '../interactions/catalog'
import {
  FEATURE_INTERACTION_CATEGORIES,
  getFeatureInteractionCategory
} from '../interactions/categories'
import { FEATURE_INTERACTION_USAGE_BUCKETS } from '../interactions/usage-buckets'
import {
  starNagAgentBucketSchema,
  starNagOutcomeSchema,
  starNagPromptModeSchema,
  starNagPromptSourceSchema
} from '../star-nag'
import { appStarSourceSchema } from '../star-source'
import {
  agentKindSchema,
  errorClassSchema,
  featureWallExitActionSchema,
  featureWallOpenSourceSchema,
  featureWallTileIdSchema,
  featureWallTourDepthStepSchema,
  featureWallWorkflowIdSchema,
  launchSourceSchema,
  optInViaSchema,
  repoMethodSchema,
  requestKindSchema,
  settingsChangedKeySchema,
  workspaceSourceSchema
} from './foundations'

export const nthRepoAddedSchema = z.number().int().nonnegative().optional()

export const appOpenedSchema = z.object({ nth_repo_added: nthRepoAddedSchema }).strict()

export const featureInteractionIdSchema = z.enum(FEATURE_INTERACTION_IDS)
export const featureInteractionCategorySchema = z.enum(FEATURE_INTERACTION_CATEGORIES)
export const featureInteractionUsageBucketSchema = z.enum(FEATURE_INTERACTION_USAGE_BUCKETS)
export const featureInteractionUsageBucketSourceSchema = z.enum([
  'crossed_now',
  'observed_existing'
])
export const featureInteractionUsageBucketReachedSchema = z
  .object({
    feature_id: featureInteractionIdSchema,
    feature_category: featureInteractionCategorySchema,
    count_bucket: featureInteractionUsageBucketSchema,
    bucket_source: featureInteractionUsageBucketSourceSchema,
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()
  .refine((value) => getFeatureInteractionCategory(value.feature_id) === value.feature_category, {
    message: 'feature_category must match feature_id',
    path: ['feature_category']
  })

export const repoAddedSchema = z
  // Why: `is_git_repo` is the real git-vs-folder signal, sourced from git
  // detection at the add point. It moved here from `onboarding_completed`
  // once project selection left onboarding (1.4.46). `.optional()` so
  // SSH/remote or any path that genuinely can't determine git-ness validates
  // cleanly instead of crashing the track call — same fail-soft intent as
  // `nthRepoAddedSchema`. Never default-guess `false`; omit instead.
  .object({
    method: repoMethodSchema,
    is_git_repo: z.boolean().optional(),
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()

export const appStarredAgentStartSchema = z
  .object({
    source: appStarSourceSchema,
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()

export const starNagOutcomeEventSchema = z
  .object({
    outcome: starNagOutcomeSchema,
    source: starNagPromptSourceSchema,
    mode: starNagPromptModeSchema,
    threshold: z.number().int().positive(),
    agents_since_baseline: z.number().int().nonnegative(),
    agents_since_baseline_bucket: starNagAgentBucketSchema,
    nth_repo_added: nthRepoAddedSchema,
    next_threshold: z.number().int().positive().optional(),
    cooldown_days: z.number().int().positive().optional()
  })
  .strict()
  .refine(
    (payload) =>
      payload.next_threshold === undefined ||
      payload.outcome === 'dismissed' ||
      payload.outcome === 'later',
    {
      message: 'next_threshold is only valid for later or dismissed outcomes',
      path: ['next_threshold']
    }
  )
  .refine(
    (payload) =>
      payload.cooldown_days === undefined ||
      payload.outcome === 'later' ||
      payload.outcome === 'dismissed',
    {
      message: 'cooldown_days is only valid for later or dismissed outcomes',
      path: ['cooldown_days']
    }
  )

export const workspaceCreatedSchema = z
  .object({
    source: workspaceSourceSchema,
    from_existing_branch: z.boolean(),
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()

export const agentStartedSchema = z
  .object({
    agent_kind: agentKindSchema,
    launch_source: launchSourceSchema,
    request_kind: requestKindSchema,
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()
export const agentPromptSentSchema = z
  .object({
    agent_kind: agentKindSchema,
    launch_source: launchSourceSchema,
    request_kind: requestKindSchema,
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()

// Enum-only by design for both fields. `error_message` and `error_stack` are
// deliberately absent — `.strict()` rejects either key if a call site ever
// tries to attach one, which fails the validator and drops the event. Raw
// error strings carry arbitrary user/workspace/path content; keeping them off
// the wire is the only way to guarantee we never transmit them by accident.
export const agentErrorSchema = z
  .object({
    error_class: errorClassSchema,
    agent_kind: agentKindSchema,
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()

// Why: emitted when the terminal daemon cannot start and terminals fall back to
// the (non-persistent) local provider. Enum-only `error_class` — the raw daemon
// stderr tail stays in local logs and never reaches the wire (paths/usernames).
// A spike in this event is the fleet-wide signal for a daemon outage like
// v1.4.129-rc.1, which was otherwise invisible until users filed bug reports.
export const daemonStartFailedSchema = z.object({ error_class: errorClassSchema }).strict()

export const settingsChangedSchema = z
  .object({
    setting_key: settingsChangedKeySchema,
    value_kind: z.enum(['bool', 'enum'])
  })
  .strict()

export const telemetryOptedInSchema = z.object({ via: optInViaSchema }).strict()
export const telemetryOptedOutSchema = z.object({ via: optInViaSchema }).strict()

export const agentstartCliFeatureTipSourceSchema = z.enum(['app_open', 'manual'])
export const agentstartCliFeatureTipShownSchema = z
  .object({
    source: agentstartCliFeatureTipSourceSchema,
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()
export const agentstartCliFeatureTipSetupClickedSchema = z
  .object({
    source: agentstartCliFeatureTipSourceSchema,
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()
export const agentstartCliFeatureTipSetupResultSchema = z
  .object({
    source: agentstartCliFeatureTipSourceSchema,
    result: z.enum(['installed', 'needs_attention', 'dev_preview', 'failed']),
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()

export const commandPaletteFeatureTipShownSchema = z
  .object({
    source: agentstartCliFeatureTipSourceSchema,
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()
export const commandPaletteFeatureTipAcknowledgedSchema = z
  .object({
    source: agentstartCliFeatureTipSourceSchema,
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()

export const featureWallOpenedSchema = z
  .object({
    source: featureWallOpenSourceSchema
  })
  .strict()
export const featureWallClosedSchema = z
  .object({
    dwell_ms: z.number().int().min(0).max(FEATURE_WALL_MAX_DWELL_MS),
    source: featureWallOpenSourceSchema.optional(),
    exit_action: featureWallExitActionSchema.optional(),
    furthest_step: featureWallTourDepthStepSchema.optional(),
    last_group_id: featureWallWorkflowIdSchema.optional(),
    visited_workflow_count: z.number().int().min(0).max(5).optional(),
    visited_substep_count: z.number().int().min(0).max(9).optional(),
    completed_workflow_count: z.number().int().min(0).max(5).optional(),
    completed_substep_count: z.number().int().min(0).max(9).optional()
  })
  .strict()
export const featureWallTileFocusedSchema = z
  .object({
    tile_id: featureWallTileIdSchema
  })
  .strict()
export const featureWallGroupSelectedSchema = z
  .object({
    group_id: featureWallWorkflowIdSchema,
    source: featureWallOpenSourceSchema
  })
  .strict()
export const featureWallFeatureSelectedSchema = z
  .object({
    group_id: featureWallWorkflowIdSchema,
    tile_id: featureWallTileIdSchema,
    source: featureWallOpenSourceSchema
  })
  .strict()

export const coreTelemetryEventSchemas = {
  app_opened: appOpenedSchema,
  app_starred_agentstart: appStarredAgentStartSchema,
  star_nag_outcome: starNagOutcomeEventSchema,
  feature_interaction_usage_bucket_reached: featureInteractionUsageBucketReachedSchema,
  repo_added: repoAddedSchema,
  workspace_created: workspaceCreatedSchema,
  agent_started: agentStartedSchema,
  agent_prompt_sent: agentPromptSentSchema,
  agent_error: agentErrorSchema,
  daemon_start_failed: daemonStartFailedSchema,
  settings_changed: settingsChangedSchema,
  telemetry_opted_in: telemetryOptedInSchema,
  telemetry_opted_out: telemetryOptedOutSchema,
  agentstart_cli_feature_tip_shown: agentstartCliFeatureTipShownSchema,
  agentstart_cli_feature_tip_setup_clicked: agentstartCliFeatureTipSetupClickedSchema,
  agentstart_cli_feature_tip_setup_result: agentstartCliFeatureTipSetupResultSchema,
  command_palette_feature_tip_shown: commandPaletteFeatureTipShownSchema,
  command_palette_feature_tip_acknowledged: commandPaletteFeatureTipAcknowledgedSchema,
  feature_wall_opened: featureWallOpenedSchema,
  feature_wall_closed: featureWallClosedSchema,
  feature_wall_tile_focused: featureWallTileFocusedSchema,
  feature_wall_group_selected: featureWallGroupSelectedSchema,
  feature_wall_feature_selected: featureWallFeatureSelectedSchema
} as const
