export type WorkbenchStepId = 'terminal' | 'editor' | 'browser'

export type ReviewStepId = 'notes' | 'pr-view' | 'ship'

export type AgentsStepId = 'statuses' | 'usage' | 'orchestration'

export type FeatureWallSetupStepId =
  | 'default-agent'
  | 'add-two-repos'
  | 'notifications'
  | 'two-worktrees'
  | 'browser'
  | 'agent-capabilities'
  | 'setup-script'

export const FEATURE_WALL_SETUP_STEP_IDS: readonly FeatureWallSetupStepId[] = [
  'two-worktrees',
  'browser',
  'notifications',
  'default-agent',
  'agent-capabilities',
  'setup-script',
  'add-two-repos'
]

export type FeatureWallWorkflowId = 'workspaces' | 'agents-orchestration' | 'workbench' | 'review'

export const FEATURE_WALL_WORKFLOW_IDS: readonly FeatureWallWorkflowId[] = [
  'workspaces',
  'agents-orchestration',
  'workbench',
  'review'
]
