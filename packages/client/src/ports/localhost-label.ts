import type { WorkspacePort } from '@agentstart/protocol'
import type { Project } from '@agentstart/protocol/project/model'
import type { Repo } from '@agentstart/protocol/project/repository'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type { LocalhostWorktreeLabelRoute } from '~renderer/ports/loopback-url'

import { browserUrlForPort } from './urls'

export function localhostWorktreeLabelRouteForPort({
  port,
  repo,
  project,
  settings
}: {
  port: WorkspacePort
  repo: Repo | null | undefined
  project?: Project | null
  settings: Pick<GlobalSettings, 'localhostWorktreeLabelsEnabled'> | null | undefined
}): LocalhostWorktreeLabelRoute | null {
  if (settings?.localhostWorktreeLabelsEnabled !== true || port.kind !== 'workspace' || !repo) {
    return null
  }
  const projectSource = project ?? repo
  return {
    targetUrl: browserUrlForPort(port),
    projectName: projectSource.displayName,
    worktreeName: port.owner.displayName,
    // Why: getLocalhostWorktreeHostLabel derives the slug from worktreePath ??
    // worktreeName, so omitting it here would yield a different label than the
    // terminal-link/runtime builders that always pass port.owner.path.
    worktreePath: port.owner.path,
    repoId: repo.id,
    worktreeId: port.owner.worktreeId
  }
}
