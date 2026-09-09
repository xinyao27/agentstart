import type { ExecutionHostScope } from '@yiru/protocol/host/identity'
import type { Repo } from '@yiru/protocol/project/repository'
import {
  getNewWorkspaceDialogEligibleRepos,
  resolveNewWorkspaceDialogGitRepoId,
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

export function resolveComposerGitRepoId(input: {
  eligibleRepos: readonly Repo[]
  draftRepoId?: string | null
  initialRepoId?: string | null
  activeRepoId?: string | null
  focusedHostScope?: ExecutionHostScope | null
}): string | null {
  return resolveNewWorkspaceDialogGitRepoId(input)
}
