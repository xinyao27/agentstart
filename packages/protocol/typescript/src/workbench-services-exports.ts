// Why: the workbench service namespaces that moved off legacy JSON in one wave
// re-export from here so protocol.ts stays under the max-lines budget.
export { ShellCacheClient, ShellOnboardingClient } from './shell-state-client.js'
export {
  SHELL_CACHE_PROTOCOL_CAPABILITY,
  SHELL_ONBOARDING_PROTOCOL_CAPABILITY,
  type ShellCacheGitHubCacheValue,
  type ShellCachePlainJsonValue,
  type ShellOnboardingOutcomeName,
  type ShellOnboardingStateValue
} from './shell-state-values.js'
export type { ShellOnboardingUpdateInput } from './shell-state-client.js'
export { ShellEventsClient } from './shell-events-client.js'
export {
  SHELL_EVENTS_PROTOCOL_CAPABILITY,
  type ShellEventsStarNagShowValue,
  type ShellEventsStarNagSurfaceName,
  type ShellEventsSubscriptionEventValue
} from './shell-events-values.js'
export type { ShellEventsSubscription } from './shell-events-client.js'
export { ShellRuntimeClient, SHELL_RUNTIME_PROTOCOL_CAPABILITY } from './shell-runtime-client.js'
export type { ShellRuntimeWindowGraph } from './shell-runtime-client.js'
export { ProjectClient } from './project-client.js'
export type {
  ProjectListResult,
  ProjectUpdateInput,
  ProjectUpdateResult
} from './project-client.js'
export {
  PROJECT_PROTOCOL_CAPABILITY,
  type ProjectGitRemoteIdentityValue,
  type ProjectProviderIdentityValue,
  type ProjectRuntimePreferenceValue,
  type ProjectValue
} from './project-values.js'
export {
  ProjectContextClient,
  PROJECT_CONTEXT_PROTOCOL_CAPABILITY
} from './project-context-client.js'
export type { ProjectContextMatchValue } from './project-context-client.js'
export { NotebookClient, NOTEBOOK_PROTOCOL_CAPABILITY } from './notebook-client.js'
export type { NotebookCellRunResult, NotebookRunPythonCellInput } from './notebook-client.js'
export {
  ExternalEditorClient,
  EXTERNAL_EDITOR_PROTOCOL_CAPABILITY
} from './external-editor-client.js'
export type {
  ExternalEditorOpenRemoteSshInput,
  ExternalEditorOpenRemoteSshResult
} from './external-editor-client.js'
export { VisualRegressionClient } from './visual-regression-client.js'
export {
  VISUAL_REGRESSION_PROTOCOL_CAPABILITY,
  type VisualRegressionCaptureValue
} from './visual-regression-values.js'
export type {
  VisualRegressionLatestInput,
  VisualRegressionLatestResult,
  VisualRegressionSaveInput,
  VisualRegressionSaveResult
} from './visual-regression-client.js'
export { WorkspaceSpaceClient } from './workspace-space-client.js'
export type { WorkspaceSpaceAnalyzeResultValue } from './workspace-space-client.js'
export {
  WORKSPACE_SPACE_PROTOCOL_CAPABILITY,
  type WorkspaceSpaceAnalysisValue,
  type WorkspaceSpaceItemValue,
  type WorkspaceSpaceRepoSummaryValue,
  type WorkspaceSpaceScanStatusName,
  type WorkspaceSpaceWorktreeValue
} from './workspace-space-values.js'
