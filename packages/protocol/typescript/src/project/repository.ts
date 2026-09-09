import type { RepoValue } from '../repo-types.js'

export type Repo = RepoValue

export function getRepoKind(repo: Pick<Repo, 'kind'>): 'git' | 'folder' {
  return repo.kind === 'folder' ? 'folder' : 'git'
}

export function isFolderRepo(repo: Pick<Repo, 'kind'>): boolean {
  return getRepoKind(repo) === 'folder'
}

export function isGitRepoKind(repo: Pick<Repo, 'kind'>): boolean {
  return getRepoKind(repo) === 'git'
}
