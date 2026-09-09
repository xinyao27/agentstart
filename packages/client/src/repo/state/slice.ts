import type { ExecutionHostId } from '@yiru/protocol/host/identity'
import type {
  ProjectGroup,
  ProjectGroupImportResult,
  NestedRepoScanResult
} from '@yiru/protocol/project/group-model'
import type {
  Project,
  ProjectHostSetup,
  ProjectHostSetupCloneArgs,
  ProjectHostSetupCreateArgs,
  ProjectHostSetupCreateResult,
  ProjectHostSetupDeleteArgs,
  ProjectHostSetupDeleteResult,
  ProjectHostSetupExistingFolderArgs,
  ProjectHostSetupResult,
  ProjectHostSetupUpdateArgs,
  ProjectHostSetupUpdateResult
} from '@yiru/protocol/project/model'
import type { Repo } from '@yiru/protocol/project/repository'
import type { FolderWorkspace } from '@yiru/protocol/workspace/folder'
import type {
  FolderWorkspacePathStatus,
  FolderWorkspacePathStatusRequest
} from '@yiru/protocol/workspace/folder-path'
import type { StateCreator } from 'zustand'

import type { AppState } from '../../store/types'
import { createRepoAddProjectActions } from './add-project-actions'
import { createFolderWorkspaceActions } from './folder-workspace-actions'
import { createRepoHostSetupActions } from './host-setup-actions'
import { createRepoNestedScanActions } from './nested-scan-actions'
import { createRepoPathStatusActions } from './path-status-actions'
import type {
  AddRepoPathRouteOptions,
  FolderWorkspacePathStatusRouteOptions
} from './path-status-model'
import { createRepoProjectGroupActions } from './project-group-actions'
import { createRepoRemoveProjectActions } from './remove-project-actions'
import { createRepoUpdateActions } from './update-actions'
import type {
  DeleteProjectGroupWithContainedProjectsOptions,
  DeleteProjectGroupWithContainedProjectsResult,
  FolderWorkspacePathStatusCacheEntry,
  NestedRepoScanControls,
  ProjectUpdate,
  RepoUpdate
} from './update-model'
export type {
  RepoUpdate,
  FolderWorkspacePathStatusCacheEntry,
  DeleteProjectGroupWithContainedProjectsOptions,
  ProjectRemovalFailure,
  DeleteProjectGroupWithContainedProjectsResult
} from './update-model'

export type RepoSlice = {
  repos: Repo[]
  projects: Project[]
  projectHostSetups: ProjectHostSetup[]
  projectGroups: ProjectGroup[]
  folderWorkspaces: FolderWorkspace[]
  folderWorkspacePathStatuses: Record<string, FolderWorkspacePathStatusCacheEntry>
  activeRepoId: string | null
  addRepo: () => Promise<Repo | null>
  addRepoPath: (
    path: string,
    kind?: 'git' | 'folder',
    options?: AddRepoPathRouteOptions
  ) => Promise<Repo | null>
  setupProjectExistingFolder: (
    args: ProjectHostSetupExistingFolderArgs
  ) => Promise<ProjectHostSetupResult | null>
  createProjectHostSetup: (
    args: ProjectHostSetupCreateArgs
  ) => Promise<ProjectHostSetupCreateResult | null>
  updateProjectHostSetup: (
    args: ProjectHostSetupUpdateArgs
  ) => Promise<ProjectHostSetupUpdateResult | null>
  deleteProjectHostSetup: (
    args: ProjectHostSetupDeleteArgs
  ) => Promise<ProjectHostSetupDeleteResult | null>
  setupProjectClone: (args: ProjectHostSetupCloneArgs) => Promise<ProjectHostSetupResult | null>
  registerNonGitFolder: (path: string, options?: AddRepoPathRouteOptions) => Promise<Repo | null>
  scanNestedRepos: (
    path: string,
    controls?: NestedRepoScanControls
  ) => Promise<NestedRepoScanResult | null>
  cancelNestedRepoScan: (scanId: string) => Promise<boolean>
  importNestedRepos: (args: {
    parentPath: string
    groupName: string
    projectPaths: string[]
    scanId?: string
    mode: 'group' | 'separate'
  }) => Promise<ProjectGroupImportResult | null>
  createProjectGroup: (name: string) => Promise<ProjectGroup | null>
  createFolderWorkspace: (
    args: {
      projectGroupId: string
      name?: string
      folderPath?: string | null
      connectionId?: string | null
      linkedReview?: FolderWorkspace['linkedReview']
      createdWithAgent?: FolderWorkspace['createdWithAgent']
      pendingFirstAgentMessageRename?: boolean
    },
    options?: FolderWorkspacePathStatusRouteOptions
  ) => Promise<FolderWorkspace | null>
  getFolderWorkspacePathStatusCacheKey: (
    request: FolderWorkspacePathStatusRequest,
    options?: FolderWorkspacePathStatusRouteOptions
  ) => string
  getFreshFolderWorkspacePathStatus: (
    request: FolderWorkspacePathStatusRequest,
    options?: FolderWorkspacePathStatusRouteOptions
  ) => FolderWorkspacePathStatus | null
  fetchFolderWorkspacePathStatus: (
    request: FolderWorkspacePathStatusRequest,
    options?: { force?: boolean } & FolderWorkspacePathStatusRouteOptions
  ) => Promise<FolderWorkspacePathStatus | null>
  updateFolderWorkspace: (
    folderWorkspaceId: string,
    updates: Partial<
      Pick<
        FolderWorkspace,
        | 'name'
        | 'folderPath'
        | 'linkedReview'
        | 'comment'
        | 'isArchived'
        | 'isUnread'
        | 'isPinned'
        | 'sortOrder'
        | 'manualOrder'
        | 'workspaceStatus'
        | 'createdWithAgent'
        | 'pendingFirstAgentMessageRename'
        | 'firstAgentMessageRenameError'
        | 'lastActivityAt'
      >
    >
  ) => Promise<boolean>
  deleteFolderWorkspace: (folderWorkspaceId: string) => Promise<boolean>
  updateProjectGroup: (
    groupId: string,
    updates: Partial<Pick<ProjectGroup, 'name' | 'isCollapsed' | 'tabOrder' | 'color'>>
  ) => Promise<boolean>
  deleteProjectGroup: (groupId: string) => Promise<boolean>
  deleteProjectGroupWithContainedProjects: (
    groupId: string,
    options: DeleteProjectGroupWithContainedProjectsOptions
  ) => Promise<DeleteProjectGroupWithContainedProjectsResult>
  moveProjectToGroup: (
    projectId: string,
    groupId: string | null,
    order?: number
  ) => Promise<boolean>
  // options.hostId disambiguates which host's row to remove when the same repo
  // id exists on multiple hosts; without it the focused host is assumed.
  removeProject: (projectId: string, options?: { hostId?: ExecutionHostId }) => Promise<boolean>
  updateProject: (projectId: string, updates: ProjectUpdate) => Promise<boolean>
  // options.hostId targets a specific host's repo row + RPC target when the same
  // repo id exists on multiple hosts; without it the focused host is assumed.
  updateRepo: (
    projectId: string,
    updates: RepoUpdate,
    options?: { hostId?: ExecutionHostId }
  ) => Promise<boolean>
  setActiveRepo: (projectId: string | null) => void
  reorderRepos: (orderedIds: string[]) => Promise<void>
}

export const createRepoSlice: StateCreator<AppState, [], [], RepoSlice> = (set, get) => ({
  repos: [],
  projects: [],
  projectHostSetups: [],
  projectGroups: [],
  folderWorkspaces: [],
  folderWorkspacePathStatuses: {},
  activeRepoId: null,
  ...createRepoPathStatusActions(set, get),
  ...createRepoNestedScanActions(set, get),
  ...createFolderWorkspaceActions(set, get),
  ...createRepoProjectGroupActions(set, get),
  ...createRepoAddProjectActions(set, get),
  ...createRepoHostSetupActions(set, get),
  ...createRepoRemoveProjectActions(set, get),

  ...createRepoUpdateActions(set, get)
})
