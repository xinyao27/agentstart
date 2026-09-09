import type { ExecutionHostId } from '../host/identity.js'
import type {
  ProjectHostSetupRecordValue,
  ProjectHostSetupStateValue,
  ProjectHostSetupMethodValue
} from '../project-host-setup-values.js'
import type { ProjectValue, ProjectProviderIdentityValue } from '../project-values.js'
import type { RepoValue, RepoKindValue, RepoHookSettingsValue } from '../repo-types.js'
import type { RepoSourceControlAiOverrides } from '../source-control/ai-types.js'

export type RepoKind = RepoKindValue
export type ForgeRemotePreference = 'upstream' | 'origin' | 'auto'
export type ExternalWorktreeVisibility = 'hide' | 'show'
export type ProjectProviderIdentity = ProjectProviderIdentityValue

type OptionalProjectFields =
  | 'repoIcon'
  | 'kind'
  | 'providerIdentity'
  | 'gitRemoteIdentity'
  | 'localWindowsRuntimePreference'
export type Project = Omit<ProjectValue, OptionalProjectFields> &
  Partial<Pick<ProjectValue, OptionalProjectFields>>

export type ProjectUpdateArgs = {
  projectId: string
  updates: Partial<Pick<Project, 'localWindowsRuntimePreference'>>
}

export type ProjectHostSetupState = ProjectHostSetupStateValue
export type ProjectHostSetupMethod = ProjectHostSetupMethodValue
export type RepoProjectHostSetupMethod = Extract<
  ProjectHostSetupMethod,
  'imported-existing-folder' | 'cloned'
>

export type ProjectHostSetup = ProjectHostSetupRecordValue & {
  connectionId?: string | null
  hookSettings?: RepoHookSettingsValue
  sourceControlAi?: RepoSourceControlAiOverrides
}

export type ProjectHostSetupExistingFolderArgs = {
  projectId: string
  hostId: ExecutionHostId
  path: string
  kind?: RepoKind
  displayName?: string
  setupMethod?: RepoProjectHostSetupMethod
}

export type ProjectHostSetupCreateArgs = {
  projectId: string
  hostId: ExecutionHostId
  setupId?: string
  path?: string
  kind?: RepoKind
  displayName?: string
  worktreeBasePath?: string
  gitUsername?: string
  setupState?: ProjectHostSetupState
  setupMethod?: Exclude<ProjectHostSetupMethod, 'legacy-repo'>
}

export type ProjectHostSetupCloneArgs = {
  projectId: string
  hostId: ExecutionHostId
  url: string
  destination: string
  displayName?: string
}

export type ProjectHostSetupUpdateArgs = {
  setupId: string
  updates: Partial<
    Pick<
      ProjectHostSetup,
      | 'displayName'
      | 'path'
      | 'worktreeBasePath'
      | 'setupState'
      | 'setupMethod'
      | 'gitUsername'
      | 'kind'
    >
  >
}

export type ProjectHostSetupDeleteArgs = {
  setupId: string
}

export type ProjectHostSetupResult = {
  project: Project
  setup: ProjectHostSetup
  repo: RepoValue
}

export type ProjectHostSetupCreateResult = {
  project: Project
  setup: ProjectHostSetup
}

export type ProjectHostSetupUpdateResult = {
  project: Project
  setup: ProjectHostSetup
  repo?: RepoValue
}

export type ProjectHostSetupDeleteResult = {
  project: Project
  setup: ProjectHostSetup
  repo?: RepoValue
}
