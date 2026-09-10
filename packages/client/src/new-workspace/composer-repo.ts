import type { ExecutionHostScope } from '@agentstart/protocol/host/identity'
import type { Repo } from '@agentstart/protocol/project/repository'
import {
  getNewWorkspaceDialogEligibleRepos,
  resolveNewWorkspaceDialogRepoId
} from '~renderer/new-workspace-dialog-repo'

export function getComposerEligibleRepos(repos: readonly Repo[]): Repo[] {
  return getNewWorkspaceDialogEligibleRepos(repos)
}

export function resolveComposerRepoId(input: {
  eligibleRepos: readonly Repo[]
  draftRepoId?: string | null
  initialRepoId?: string | null
  activeRepoId?: string | null
  focusedHostScope?: ExecutionHostScope | null
}): string {
  return resolveNewWorkspaceDialogRepoId(input)
}
