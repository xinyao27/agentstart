import { z } from 'zod'

import { AGENT_HOOK_TARGETS } from '../../agent/hooks'
import { nthRepoAddedSchema } from './core'
import {
  addRepoDefaultCheckoutHandoffReasonSchema,
  addRepoDefaultCheckoutHandoffResultSchema,
  addRepoDefaultCheckoutHandoffSourceSchema,
  addRepoExistingWorkspaceSourceSchema,
  addRepoSetupStepActionSchema,
  setupScriptImportProviderSchema,
  workspaceCreateErrorClassSchema,
  workspaceSourceSchema
} from './foundations'

export const existingWorkspaceCountSchema = z.number().int().min(1).max(50)
export const addRepoExistingWorkspaceContextSchema = {
  source: addRepoExistingWorkspaceSourceSchema,
  existing_workspace_count: existingWorkspaceCountSchema,
  existing_linked_workspace_count: z.number().int().min(0).max(50)
} as const

export const addRepoSetupStepActionEventSchema = z
  .object({
    action: addRepoSetupStepActionSchema,
    source: addRepoExistingWorkspaceSourceSchema.optional(),
    existing_workspace_count: existingWorkspaceCountSchema.optional(),
    existing_linked_workspace_count: z.number().int().min(0).max(50).optional(),
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()
export const addRepoExistingWorkspacesDetectedSchema = z
  .object({
    ...addRepoExistingWorkspaceContextSchema,
    main_workspace_count: z.number().int().min(0).max(50),
    branch_named_workspace_count: z.number().int().min(0).max(50),
    detached_workspace_count: z.number().int().min(0).max(50),
    custom_named_workspace_count: z.number().int().min(0).max(50),
    sparse_workspace_count: z.number().int().min(0).max(50),
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()
export const addRepoDefaultCheckoutHandoffSchema = z
  .object({
    source: addRepoDefaultCheckoutHandoffSourceSchema,
    result: addRepoDefaultCheckoutHandoffResultSchema,
    reason: addRepoDefaultCheckoutHandoffReasonSchema,
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()

// Why: same enum-only discipline as `agent_error` — `.strict()` rejects raw
// error strings if a future call site tries to attach `error_message` /
// `error_stack`. The classifier in worktrees.ts reads `error.message` to
// bucket into the enum, but those strings never cross the wire.
export const workspaceCreateFailedSchema = z
  .object({
    source: workspaceSourceSchema,
    error_class: workspaceCreateErrorClassSchema,
    nth_repo_added: nthRepoAddedSchema
  })
  .strict()

export const setupScriptPromptModeSchema = z.enum(['import_available', 'configure_needed'])
export const setupScriptCountBucketSchema = z.enum(['0', '1', '2-3', '4+'])
export const setupScriptPromptContextSchema = {
  mode: setupScriptPromptModeSchema,
  // Why: cohort injection probes top-level ZodObject shapes; superRefine
  // keeps that path while still rejecting impossible mode/provider pairs.
  provider: setupScriptImportProviderSchema.optional(),
  file_count_bucket: setupScriptCountBucketSchema,
  unsupported_field_count_bucket: setupScriptCountBucketSchema,
  has_shared_hooks: z.boolean(),
  nth_repo_added: nthRepoAddedSchema
} as const

export type SetupScriptPromptContextTelemetry = {
  mode: z.infer<typeof setupScriptPromptModeSchema>
  provider?: z.infer<typeof setupScriptImportProviderSchema>
}

export function validateSetupScriptPromptProvider(
  props: SetupScriptPromptContextTelemetry,
  ctx: z.RefinementCtx
): void {
  if (props.mode === 'import_available' && props.provider === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['provider'],
      message: 'provider is required when a setup candidate is available'
    })
  }
  if (props.mode === 'configure_needed' && props.provider !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['provider'],
      message: 'provider is only valid when a setup candidate is available'
    })
  }
}
// Why: setup-candidate telemetry is for a retention cohort, not debugging a
// user's repo, so it carries only closed enums and count buckets.
export const setupScriptPromptShownSchema = z
  .object(setupScriptPromptContextSchema)
  .strict()
  .superRefine(validateSetupScriptPromptProvider)
export const setupScriptDetectedSaveActions = [
  'save_detected_setup_clicked',
  'save_detected_setup_completed',
  'save_detected_setup_failed'
] as const

export function isSetupScriptDetectedSaveAction(action: unknown): boolean {
  return setupScriptDetectedSaveActions.includes(action as never)
}

export function validateSetupScriptPromptAction(
  props: SetupScriptPromptContextTelemetry & {
    action?: string
    edited_before_save?: boolean
  },
  ctx: z.RefinementCtx
): void {
  validateSetupScriptPromptProvider(props, ctx)
  const isDetectedSave = isSetupScriptDetectedSaveAction(props.action)
  if (isDetectedSave && props.provider !== 'package-manager') {
    ctx.addIssue({
      code: 'custom',
      path: ['provider'],
      message: 'detected setup save actions require the package-manager provider'
    })
  }
  if (isDetectedSave && props.edited_before_save === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['edited_before_save'],
      message: 'edited_before_save is required for detected setup save actions'
    })
  }
  if (!isDetectedSave && props.edited_before_save !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['edited_before_save'],
      message: 'edited_before_save is only valid for detected setup save actions'
    })
  }
}

export const setupScriptPromptActionSchema = z
  .object({
    ...setupScriptPromptContextSchema,
    action: z.enum([
      'import_completed',
      'import_failed',
      'configure_clicked',
      'dismissed',
      ...setupScriptDetectedSaveActions
    ]),
    edited_before_save: z.boolean().optional()
  })
  .strict()
  .superRefine(validateSetupScriptPromptAction)

// Why: hook targets use executable identities (claude), not analytics labels (claude-code).
export const hookInstallAgentSchema = z.enum(AGENT_HOOK_TARGETS)
export type HookInstallAgent = z.infer<typeof hookInstallAgentSchema>

// Why: install failures are config-file-shape errors (malformed JSON, missing
// keys, ACL denials on `~/.claude` etc.) — not user content. The 200-char
// cap is the truncation contract; callers must truncate before calling
// `track`, and the validator will drop overlength strings via `.max(200)`.
export const agentHookInstallFailedSchema = z
  .object({
    agent: hookInstallAgentSchema,
    error_message: z.string().max(200)
  })
  .strict()

// Why: regression signal for paneKey attribution. A hook event whose paneKey
// does not correspond to any tab in `tabsByWorktree` indicates the renderer
// could not route the event to a pane. Pre-fix this fired routinely for
// CLI-spawned terminals (empty paneKey); post-fix it should be near-zero in
// normal use. The lone `reason` field reflects what the producer can observe
// at emission time: an empty paneKey on the wire (pre-fix CLI shape) vs. any
// non-empty paneKey that fails to resolve to a known tab in `tabsByWorktree`
// (stale tab id, malformed value, or wrong-worktree id all bucket here).
// See docs/cli-terminal-hook-pane-key.md.
export const agentHookUnattributedSchema = z
  .object({ reason: z.enum(['empty_pane_key', 'unknown_tab_id']) })
  .strict()

// ── Onboarding ──────────────────────────────────────────────────────────
//
// Closed enums only — no raw paths, repo names, clone URLs, or error
// strings. The funnel exists to measure activation, not to debug specific
// user repos.
// Why: active onboarding now has fewer steps, but these event names already
// carried seven-step payloads. Keep validation backward-compatible for old rows
// unless a future versioned event replaces the historical schema.

export const repoSetupTelemetryEventSchemas = {
  add_repo_setup_step_action: addRepoSetupStepActionEventSchema,
  add_repo_existing_workspaces_detected: addRepoExistingWorkspacesDetectedSchema,
  add_repo_default_checkout_handoff: addRepoDefaultCheckoutHandoffSchema,
  workspace_create_failed: workspaceCreateFailedSchema,
  setup_script_prompt_shown: setupScriptPromptShownSchema,
  setup_script_prompt_action: setupScriptPromptActionSchema,
  agent_hook_install_failed: agentHookInstallFailedSchema,
  agent_hook_unattributed: agentHookUnattributedSchema
} as const
