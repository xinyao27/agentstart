import type { TuiAgent } from '../agent/types'

export type SourceControlTextActionId = 'commitMessage' | 'pullRequest' | 'branchName'

export type SourceControlLaunchActionId =
  | 'fixCommitFailure'
  | 'fixPushFailure'
  | 'fixChecks'
  | 'resolveConflicts'
  | 'resolveComments'

export type SourceControlActionId = SourceControlTextActionId | SourceControlLaunchActionId

export type SourceControlActionRecipe = {
  agentId?: TuiAgent | 'custom' | null
  commandInputTemplate?: string
  agentArgs?: string
}

export type SourceControlAiActionDefaults = Partial<
  Record<SourceControlActionId, SourceControlActionRecipe>
>

export const SOURCE_CONTROL_TEXT_ACTION_IDS = [
  'commitMessage',
  'pullRequest',
  'branchName'
] as const satisfies readonly SourceControlTextActionId[]

export const SOURCE_CONTROL_LAUNCH_ACTION_IDS = [
  'fixCommitFailure',
  'fixPushFailure',
  'fixChecks',
  'resolveConflicts',
  'resolveComments'
] as const satisfies readonly SourceControlLaunchActionId[]

export const SOURCE_CONTROL_ACTION_IDS = [
  ...SOURCE_CONTROL_TEXT_ACTION_IDS,
  ...SOURCE_CONTROL_LAUNCH_ACTION_IDS
] as const satisfies readonly SourceControlActionId[]

export const DEFAULT_SOURCE_CONTROL_ACTION_COMMAND_TEMPLATES: Record<
  SourceControlActionId,
  string
> = {
  commitMessage: '{basePrompt}',
  pullRequest: '{basePrompt}',
  branchName: '{basePrompt}',
  fixCommitFailure: '{basePrompt}',
  fixPushFailure: '{basePrompt}',
  fixChecks: '{basePrompt}',
  resolveConflicts: '{basePrompt}',
  resolveComments: '{basePrompt}'
}

export const SOURCE_CONTROL_ACTION_VARIABLES: Record<SourceControlActionId, string[]> = {
  commitMessage: ['basePrompt', 'branch', 'stagedFiles', 'stagedPatch'],
  pullRequest: [
    'basePrompt',
    'branch',
    'baseBranch',
    'currentTitle',
    'currentBody',
    'commitSummary',
    'changedFiles',
    'patch'
  ],
  branchName: ['basePrompt', 'firstPrompt', 'assistantMessage'],
  fixCommitFailure: ['basePrompt'],
  fixPushFailure: ['basePrompt'],
  fixChecks: ['basePrompt'],
  resolveConflicts: ['basePrompt'],
  resolveComments: ['basePrompt']
}
