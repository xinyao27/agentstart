import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId,
  type ExecutionHostId
} from '@agentstart/protocol/host/identity'
import { isPathInsideOrEqual } from '@agentstart/protocol/host/path'
import type { GitHubWorkItem } from '@agentstart/protocol/hosted-review/review-types'
import type { ProjectGroup } from '@agentstart/protocol/project/group-model'
import { getProjectGroupSubtreeIds } from '@agentstart/protocol/project/group-tree'
import type { Repo } from '@agentstart/protocol/project/repository'
import { isGitRepoKind } from '@agentstart/protocol/project/repository'
import type { FolderWorkspace } from '@agentstart/protocol/workspace/folder'
import { translate } from '~renderer/i18n/i18n'
import {
  buildGitHubWorkspaceSource,
  buildWorkspaceSourceSelection,
  getWorkspaceSourceName,
  getWorkspaceSourceProvider
} from '~renderer/new-workspace/naming/source'
import type { SmartWorkspaceNameSelection } from '~renderer/new-workspace/smart-workspace-name-field'
import type { LinkedWorkItemSummary } from '~renderer/new-workspace/workspace-creation'

const EMPTY_REPOS: Repo[] = []

function getProjectGroupExecutionHostId(projectGroup: ProjectGroup): ExecutionHostId {
  const executionHostId = normalizeExecutionHostId(projectGroup.executionHostId)
  if (executionHostId) {
    return executionHostId
  }
  return LOCAL_EXECUTION_HOST_ID
}

export function getFolderSourceRepos(
  repos: readonly Repo[],
  projectGroups: readonly ProjectGroup[],
  projectGroup: ProjectGroup | null
): Repo[] {
  if (!projectGroup?.parentPath) {
    return EMPTY_REPOS
  }
  const folderPath = projectGroup.parentPath
  const groupIds = getProjectGroupSubtreeIds(projectGroups, projectGroup.id)
  const projectGroupHostId = getProjectGroupExecutionHostId(projectGroup)
  return repos.filter(
    (repo) =>
      isGitRepoKind(repo) &&
      getRepoExecutionHostId(repo) === projectGroupHostId &&
      ((typeof repo.projectGroupId === 'string' && groupIds.has(repo.projectGroupId)) ||
        isPathInsideOrEqual(folderPath, repo.path))
  )
}

export function toFolderWorkspaceLinkedReview(
  item: LinkedWorkItemSummary | null
): FolderWorkspace['linkedReview'] {
  if (!item) {
    return null
  }
  const provider = getWorkspaceSourceProvider(item)
  return {
    provider,
    type: item.type,
    number: item.number,
    title: item.title,
    url: item.url,
    ...(item.repoId ? { repoId: item.repoId } : {})
  }
}

export function getSmartNameSelection(
  linkedWorkItem: LinkedWorkItemSummary | null
): SmartWorkspaceNameSelection | null {
  return buildWorkspaceSourceSelection({ linkedWorkItem }) as SmartWorkspaceNameSelection | null
}

export function getLinkedItemDisplayName(item: LinkedWorkItemSummary): string | null {
  return getWorkspaceSourceName(item).displayName || null
}

export function toGitHubLinkedWorkItem(item: GitHubWorkItem): LinkedWorkItemSummary {
  return buildGitHubWorkspaceSource(item)
}

export function getFolderWorkspacePrimaryActionLabel(): string {
  return translate(
    'auto.components.sidebar.FolderWorkspaceComposerDialog.create',
    'Create workspace'
  )
}
