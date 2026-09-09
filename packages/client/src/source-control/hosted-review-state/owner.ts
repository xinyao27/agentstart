import { getRepoExecutionHostId, parseExecutionHostId } from '@yiru/protocol/host/identity'
import type { Repo } from '@yiru/protocol/project/repository'
import type { GlobalSettings } from '@yiru/protocol/settings/global/model'

type RuntimeFocusSettings = Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined

export function findHostedReviewRepoByPath(
  repos: readonly Repo[] | undefined,
  repoPath: string,
  repoId?: string | null
): Repo | undefined {
  return repos?.find((candidate) =>
    repoId ? candidate.id === repoId : candidate.path === repoPath
  )
}

export function settingsForHostedReviewRepoOwner(
  settings: RuntimeFocusSettings,
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> | undefined
): RuntimeFocusSettings {
  if (!repo) {
    return settings
  }
  const parsed = parseExecutionHostId(getRepoExecutionHostId(repo))
  return {
    activeRuntimeEnvironmentId: parsed?.kind === 'runtime' ? parsed.environmentId : null
  }
}

export function settingsForHostedReviewActionOwner(
  settings: RuntimeFocusSettings,
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> | undefined
): RuntimeFocusSettings {
  // Why: connectionId is no longer populated; executionHostId is the ownership source.
  return repo?.executionHostId ? settingsForHostedReviewRepoOwner(settings, repo) : settings
}
