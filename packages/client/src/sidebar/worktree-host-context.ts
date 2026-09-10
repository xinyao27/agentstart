import {
  getRepoExecutionHostId,
  getWorktreeExecutionHostId,
  type ExecutionHostId
} from '@agentstart/protocol/host/identity'
import type { Repo } from '@agentstart/protocol/project/repository'
import type { WorkspaceStatusDefinition } from '@agentstart/protocol/workspace/status/model'
import type { Worktree } from '@agentstart/protocol/worktree/model'
import { getExecutionHostLabel } from '~renderer/execution-host/labels'
import type { AppState } from '~renderer/store/types'

import { getGroupKeyForWorktree } from './worktree-group-keys'
import { ALL_GROUP_KEY } from './worktree-group-metadata'
import type {
  GroupHeaderRow,
  ProjectGroupingModel,
  WorktreeGroupBy,
  WorktreeGroupEntry
} from './worktree-list/rows'
import type { ProjectGroupingIndex } from './worktree-project-grouping'

function getRepoHostLabel(
  repoId: string,
  repoMap: Map<string, Repo>,
  projectIndex: ProjectGroupingIndex | null,
  hostLabelById: ReadonlyMap<string, string> | undefined
): string | null {
  const setup = projectIndex?.setupByRepoId.get(repoId)
  if (setup) {
    return hostLabelById?.get(setup.hostId) ?? getExecutionHostLabel(setup.hostId)
  }
  const repo = repoMap.get(repoId)
  if (!repo) {
    return null
  }
  const hostId = getRepoExecutionHostId(repo)
  return hostLabelById?.get(hostId) ?? getExecutionHostLabel(hostId)
}

export function getMixedHostContextLabels(
  group: WorktreeGroupEntry,
  repoMap: Map<string, Repo>,
  projectIndex: ProjectGroupingIndex | null,
  hostLabelById: ReadonlyMap<string, string> | undefined
): Map<string, string> | undefined {
  const labelsByRepoId = new Map<string, string>()
  const uniqueLabels = new Set<string>()
  for (const repoId of group.repoIds) {
    const label = getRepoHostLabel(repoId, repoMap, projectIndex, hostLabelById)
    if (!label) {
      continue
    }
    labelsByRepoId.set(repoId, label)
    uniqueLabels.add(label)
  }
  return uniqueLabels.size > 1 ? labelsByRepoId : undefined
}

export function getHostWorktreeMetadata(
  worktrees: readonly Worktree[],
  repoMap: Map<string, Repo>,
  defaultHostId: ExecutionHostId
): Pick<GroupHeaderRow, 'hostWorktreeCounts' | 'hostWorktreeIds'> {
  if (worktrees.length === 0) {
    return {}
  }
  const counts = new Map<ExecutionHostId, number>()
  const idsByHost = new Map<ExecutionHostId, string[]>()
  const seen = new Set<string>()
  for (const worktree of worktrees) {
    if (seen.has(worktree.id)) {
      continue
    }
    seen.add(worktree.id)
    const hostId = getWorktreeExecutionHostId(worktree, repoMap.get(worktree.repoId), defaultHostId)
    counts.set(hostId, (counts.get(hostId) ?? 0) + 1)
    const ids = idsByHost.get(hostId) ?? []
    ids.push(worktree.id)
    idsByHost.set(hostId, ids)
  }
  return { hostWorktreeCounts: counts, hostWorktreeIds: idsByHost }
}

export function getRenderedNaturalAnchorRepoIds(args: {
  groupBy: WorktreeGroupBy
  worktrees: readonly Worktree[]
  repoMap: Map<string, Repo>
  prCache: Record<string, unknown> | null
  collapsedGroups: ReadonlySet<string>
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  settings?: AppState['settings']
  projectGrouping?: ProjectGroupingModel
}): Set<string> {
  const renderedRepoIds = new Set<string>()
  if (args.groupBy === 'none') {
    if (!args.collapsedGroups.has(ALL_GROUP_KEY)) {
      for (const worktree of args.worktrees) {
        renderedRepoIds.add(worktree.repoId)
      }
    }
    return renderedRepoIds
  }
  if (args.groupBy === 'repo') {
    for (const worktree of args.worktrees) {
      renderedRepoIds.add(worktree.repoId)
    }
    return renderedRepoIds
  }
  for (const worktree of args.worktrees) {
    const groupKey = getGroupKeyForWorktree(
      args.groupBy,
      worktree,
      args.repoMap,
      args.prCache,
      args.workspaceStatuses,
      args.settings,
      args.projectGrouping
    )
    if (!args.collapsedGroups.has(groupKey)) {
      renderedRepoIds.add(worktree.repoId)
    }
  }
  return renderedRepoIds
}
