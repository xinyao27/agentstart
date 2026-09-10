import type { WorkspacePort } from '@agentstart/protocol'
import type { Project } from '@agentstart/protocol/project/model'
import type { Repo } from '@agentstart/protocol/project/repository'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type { LocalhostWorktreeLabelRoute } from '~renderer/ports/loopback-url'
import { useAppStore } from '~renderer/store/state'

import { localhostWorktreeLabelRouteForPort } from './localhost-label'

// Why: the port → repo → worktree → project resolution feeding
// localhostWorktreeLabelRouteForPort was duplicated across every ports surface;
// this is the single source for both reactive and imperative call sites.
type LocalhostLabelLookupState = {
  settings?: Pick<GlobalSettings, 'localhostWorktreeLabelsEnabled'> | null
  repos?: Repo[]
  projects?: Project[]
  getKnownWorktreeById?: (worktreeId: string) => { projectId?: string | null } | null | undefined
}

export function resolveLocalhostLabelRouteForPort(
  state: LocalhostLabelLookupState,
  port: WorkspacePort
): LocalhostWorktreeLabelRoute | null {
  if (port.kind !== 'workspace') {
    return null
  }
  const repo = (state.repos ?? []).find((entry) => entry.id === port.owner.repoId) ?? null
  const worktree = state.getKnownWorktreeById?.(port.owner.worktreeId) ?? null
  const project = worktree?.projectId
    ? ((state.projects ?? []).find((entry) => entry.id === worktree.projectId) ?? null)
    : null
  return localhostWorktreeLabelRouteForPort({ port, repo, project, settings: state.settings })
}

export function useLocalhostLabelRouteForPort(
  port: WorkspacePort
): LocalhostWorktreeLabelRoute | null {
  const settings = useAppStore((s) => s.settings)
  const portWorktreeId = port.kind === 'workspace' ? port.owner.worktreeId : null
  const portRepoId = port.kind === 'workspace' ? port.owner.repoId : null
  const repo = useAppStore((s) =>
    portRepoId ? ((s.repos ?? []).find((entry) => entry.id === portRepoId) ?? null) : null
  )
  const worktree = useAppStore((s) =>
    portWorktreeId ? (s.getKnownWorktreeById?.(portWorktreeId) ?? null) : null
  )
  const project = useAppStore((s) =>
    worktree?.projectId
      ? ((s.projects ?? []).find((entry) => entry.id === worktree.projectId) ?? null)
      : null
  )
  return localhostWorktreeLabelRouteForPort({ port, repo, project, settings })
}
