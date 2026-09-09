import type { TuiAgent } from '@yiru/protocol/agent/types'
import type { ProjectGroup } from '@yiru/protocol/project/group-model'
import type { Repo } from '@yiru/protocol/project/repository'
import type { ProjectSourceContext } from '@yiru/protocol/project/source-context'
import { useEffect } from 'react'
import type { AppState } from '~renderer/store/state'

import type { WorkspaceCreationTargetResolution } from './project-host-workspace-target'
import { PER_REPO_FETCH_LIMIT, type LinkedWorkItemSummary } from './workspace-creation'

type UseComposerSyncOptions = {
  agent: TuiAgent
  agentPrompt: string
  attachmentPaths: string[]
  baseBranch: string | undefined
  compareBaseRef: string | undefined
  eligibleRepos: Repo[]
  folderSourceRepos: Repo[]
  isProjectGroupTarget: boolean
  linkedPR: number | null
  linkedWorkItem: LinkedWorkItemSummary | null
  name: string
  note: string
  persistDraft: boolean
  prefetchWorkItems: AppState['prefetchWorkItems']
  prefetchWorktreeCreateBase: AppState['prefetchWorktreeCreateBase']
  projectSourceContext: ProjectSourceContext | null
  repoId: string
  selectedProjectGroup: ProjectGroup | null
  selectedRepo: Repo | undefined
  selectedRepoIsGit: boolean
  selectedWorkspaceTarget: WorkspaceCreationTargetResolution
  setNewWorkspaceDraft: AppState['setNewWorkspaceDraft']
  setRepoId: (repoId: string) => void
}

export function useComposerSync(options: UseComposerSyncOptions): void {
  const {
    agent,
    agentPrompt,
    attachmentPaths,
    baseBranch,
    compareBaseRef,
    eligibleRepos,
    folderSourceRepos,
    isProjectGroupTarget,
    linkedPR,
    linkedWorkItem,
    name,
    note,
    persistDraft,
    prefetchWorkItems,
    prefetchWorktreeCreateBase,
    projectSourceContext,
    repoId,
    selectedProjectGroup,
    selectedRepo,
    selectedRepoIsGit,
    selectedWorkspaceTarget,
    setNewWorkspaceDraft,
    setRepoId
  } = options
  useEffect(() => {
    if (!persistDraft) {
      return
    }
    setNewWorkspaceDraft({
      repoId: repoId || null,
      projectId:
        selectedProjectGroup !== null
          ? null
          : selectedWorkspaceTarget.status === 'ready'
            ? selectedWorkspaceTarget.target.projectId
            : null,
      projectGroupId: selectedProjectGroup?.id ?? null,
      hostId:
        selectedProjectGroup !== null
          ? null
          : selectedWorkspaceTarget.status === 'ready'
            ? selectedWorkspaceTarget.target.hostId
            : null,
      projectHostSetupId:
        selectedProjectGroup !== null
          ? null
          : selectedWorkspaceTarget.status === 'ready'
            ? selectedWorkspaceTarget.target.projectHostSetupId
            : null,
      name,
      prompt: agentPrompt,
      note,
      attachments: attachmentPaths,
      linkedWorkItem,
      projectSourceContext,
      agent,
      linkedPR,
      ...(baseBranch !== undefined ? { baseBranch } : {}),
      ...(compareBaseRef !== undefined ? { compareBaseRef } : {})
    })
  }, [
    agent,
    agentPrompt,
    attachmentPaths,
    baseBranch,
    compareBaseRef,
    linkedPR,
    linkedWorkItem,
    name,
    note,
    persistDraft,
    projectSourceContext,
    repoId,
    selectedProjectGroup,
    selectedWorkspaceTarget,
    setNewWorkspaceDraft
  ])

  useEffect(() => {
    if (!isProjectGroupTarget && !repoId && eligibleRepos[0]?.id) {
      setRepoId(eligibleRepos[0].id)
    }
  }, [eligibleRepos, isProjectGroupTarget, repoId, setRepoId])

  useEffect(() => {
    if (
      selectedProjectGroup &&
      (!repoId || !folderSourceRepos.some((repo) => repo.id === repoId))
    ) {
      setRepoId(folderSourceRepos[0]?.id ?? '')
    }
  }, [folderSourceRepos, repoId, selectedProjectGroup, setRepoId])

  useEffect(() => {
    if (repoId && selectedRepoIsGit) {
      void prefetchWorktreeCreateBase(repoId, baseBranch)
    }
  }, [baseBranch, prefetchWorktreeCreateBase, repoId, selectedRepoIsGit])

  useEffect(() => {
    if (selectedRepoIsGit && selectedRepo?.path) {
      prefetchWorkItems(selectedRepo.id, selectedRepo.path, PER_REPO_FETCH_LIMIT, 'is:pr is:open')
    }
  }, [prefetchWorkItems, selectedRepo?.id, selectedRepo?.path, selectedRepoIsGit])
}
