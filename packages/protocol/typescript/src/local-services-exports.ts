// Why: the local-only host services that moved off legacy JSON in one wave
// re-export from here so protocol.ts stays under the max-lines budget.
export { ArtifactClient } from './artifact-client.js'
export { ARTIFACT_PROTOCOL_CAPABILITY } from './artifact-values.js'
export type {
  ArtifactBeginInput,
  ArtifactAppendInput,
  ArtifactReadInput
} from './artifact-client.js'
export type { ArtifactReadValue, ArtifactTicketValue, ArtifactValue } from './artifact-values.js'
export { DangerousApprovalClient } from './dangerous-approval-client.js'
export type {
  DangerousApprovalFinishApprovalInput,
  DangerousApprovalFinishRegistrationInput
} from './dangerous-approval-client.js'
export { DANGEROUS_APPROVAL_PROTOCOL_CAPABILITY } from './dangerous-approval-values.js'
export type {
  DangerousApprovalBeginApprovalValue,
  DangerousApprovalBeginRegistrationValue,
  DangerousApprovalCeremonyInput,
  DangerousApprovalFinishApprovalValue,
  DangerousApprovalStatusValue
} from './dangerous-approval-values.js'
export { ProjectHostSetupClient } from './project-host-setup-client.js'
export { PROJECT_HOST_SETUP_PROTOCOL_CAPABILITY } from './project-host-setup-values.js'
export type {
  ProjectHostSetupCloneInput,
  ProjectHostSetupCreateInput,
  ProjectHostSetupDeleteInput,
  ProjectHostSetupExistingFolderInput,
  ProjectHostSetupUpdateInput
} from './project-host-setup-client.js'
export type {
  ProjectHostSetupHostId,
  ProjectHostSetupListResultValue,
  ProjectHostSetupMethodValue,
  ProjectHostSetupMutationValue,
  ProjectHostSetupProjectValue,
  ProjectHostSetupRecordValue,
  ProjectHostSetupRepoValue,
  ProjectHostSetupStateValue
} from './project-host-setup-values.js'
export { ShellKeybindingsClient } from './shell-keybindings-client.js'
export { SHELL_KEYBINDINGS_PROTOCOL_CAPABILITY } from './shell-keybindings-values.js'
export type { ShellKeybindingsSetActionInput } from './shell-keybindings-client.js'
export type {
  ShellKeybindingsDiagnosticValue,
  ShellKeybindingsOverrideEntryValue,
  ShellKeybindingsOverrideMapValue,
  ShellKeybindingsPlatformValue,
  ShellKeybindingsSnapshotValue
} from './shell-keybindings-values.js'
