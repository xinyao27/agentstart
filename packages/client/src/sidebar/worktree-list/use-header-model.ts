import type { ExecutionHostId } from '@yiru/protocol/host/identity'
import type { ProjectGroup } from '@yiru/protocol/project/group-model'
import type { Repo } from '@yiru/protocol/project/repository'
import type { ProjectOrderBy } from '@yiru/protocol/settings/ui-state'
import { useEffect, type RefObject } from 'react'
import { useAppStore } from '~renderer/store/state'

import { useHostHeaderDrag } from '../host-header-drag'
import type { HostHeaderRow, HostSectionRow } from '../host-section-rows'
import { useProjectGroupHeaderDrag } from '../project-group-header-drag'
import { getSidebarOrderedProjectGroupHeaderIdsByBucket } from '../project-group-header-drop'
import { useRepoHeaderDrag } from '../project-header-drag'
import { getSidebarOrderedRepoHeaderIdsByBucket } from '../project-header-drop'
import { getProjectWorkspaceRails } from '../project-workspace-rail'
import { projectWorkspaceSidebarRows } from '../workspace-sidebar-row-projection'
import {
  getProjectGroupHeaderSectionEndByGroupId,
  getRepoHeaderSectionEndByRepoId
} from '../worktree-header-section-boundaries'
import type { Row, WorktreeGroupBy } from './groups'
import { buildRenderableRows, getRenderRowKey } from './row-model'
import { getStickyHeaderIndexes } from './virtual-rows'

function mapHeaderLocations(idsByBucket: ReadonlyMap<string, readonly string[]>): {
  indexById: Map<string, number>
  bucketById: Map<string, string>
} {
  const indexById = new Map<string, number>()
  const bucketById = new Map<string, string>()
  for (const [bucket, ids] of idsByBucket) {
    ids.forEach((id, index) => {
      indexById.set(id, index)
      bucketById.set(id, bucket)
    })
  }
  return { indexById, bucketById }
}

export function useHeaderModel(args: {
  rows: HostSectionRow[]
  groupBy: WorktreeGroupBy
  projectOrderBy: ProjectOrderBy
  projectGroups: readonly ProjectGroup[]
  allRepoIds: string[]
  repoMap: Map<string, Repo>
  scrollRef: RefObject<HTMLDivElement | null>
  onReorderHostSections: (orderedHostIds: ExecutionHostId[]) => void
  onHostDragActiveChange: (active: boolean) => void
}) {
  const { onHostDragActiveChange } = args
  const moveProjectToGroup = useAppStore((state) => state.moveProjectToGroup)
  const updateProjectGroup = useAppStore((state) => state.updateProjectGroup)
  const reorderRepos = useAppStore((state) => state.reorderRepos)
  const hasProjectGroups = args.projectGroups.length > 0
  const canReorderRepoHeaders = args.groupBy === 'repo' && args.projectOrderBy === 'manual'
  const canReorderProjectGroupHeaders = args.groupBy === 'repo' && hasProjectGroups
  const folderBackedProjectGroupIds = new Set(
    args.projectGroups
      .filter((group) => group.createdFrom === 'folder-scan')
      .map((group) => group.id)
  )
  const projectGroupById = new Map(args.projectGroups.map((group) => [group.id, group]))
  const orderedHostIds = args.rows
    .filter((row): row is HostHeaderRow => row.type === 'host-header')
    .map((row) => row.hostId)
  const hostDrag = useHostHeaderDrag({
    orderedHostIds,
    onCommit: args.onReorderHostSections,
    getScrollContainer: () => args.scrollRef.current
  })
  useEffect(() => {
    onHostDragActiveChange(hostDrag.state.draggingHostId !== null)
  }, [hostDrag.state.draggingHostId, onHostDragActiveChange])
  useEffect(() => () => onHostDragActiveChange(false), [onHostDragActiveChange])

  const renderRows = buildRenderableRows(args.rows)
  const workspaceRows = projectWorkspaceSidebarRows({
    localRows: renderRows,
    getLocalRowKey: getRenderRowKey
  })
  const projectWorkspaceRails = getProjectWorkspaceRails(
    args.groupBy === 'repo' ? workspaceRows : []
  )
  const localRows = args.rows.filter((row): row is Row => row.type !== 'host-header')
  const repoIdsByBucket = getSidebarOrderedRepoHeaderIdsByBucket(localRows)
  const groupIdsByBucket = getSidebarOrderedProjectGroupHeaderIdsByBucket(
    localRows,
    projectGroupById
  )
  const repoLocations = mapHeaderLocations(repoIdsByBucket)
  const groupLocations = mapHeaderLocations(groupIdsByBucket)

  const commitProjectGroupHeaderOrder = (groupId: string, tabOrder: number): void => {
    if (Number.isFinite(tabOrder)) {
      void updateProjectGroup(groupId, { tabOrder })
    }
  }
  const repoDrag = useRepoHeaderDrag({
    orderedRepoIds: args.allRepoIds,
    sidebarRepoHeaderIdsByBucket: repoIdsByBucket,
    repoById: args.repoMap,
    usesProjectGroupOrdering: hasProjectGroups,
    onCommitRepoOrder: reorderRepos,
    onCommitProjectGroupOrder: (repoId, projectGroupId, order) => {
      void moveProjectToGroup(repoId, projectGroupId, order)
    },
    getScrollContainer: () => args.scrollRef.current
  })
  const projectGroupDrag = useProjectGroupHeaderDrag({
    sidebarProjectGroupHeaderIdsByBucket: groupIdsByBucket,
    projectGroupById,
    onCommitProjectGroupTabOrder: commitProjectGroupHeaderOrder,
    getScrollContainer: () => args.scrollRef.current
  })
  const firstHeaderIndex = renderRows.findIndex(
    (row) => row.type === 'header' || row.type === 'host-header'
  )
  const repoHeaderSectionEndByRepoId = getRepoHeaderSectionEndByRepoId({
    rows: workspaceRows,
    localRows: renderRows,
    firstLocalHeaderIndex: firstHeaderIndex,
    sidebarRepoHeaderIdsByBucket: repoIdsByBucket,
    repoHeaderBucketByRepoId: repoLocations.bucketById
  })
  const projectGroupHeaderSectionEndByGroupId = getProjectGroupHeaderSectionEndByGroupId({
    rows: workspaceRows,
    localRows: renderRows,
    firstLocalHeaderIndex: firstHeaderIndex,
    sidebarProjectGroupHeaderIdsByBucket: groupIdsByBucket,
    projectGroupHeaderBucketByGroupId: groupLocations.bucketById
  })
  const stickyHeaderIndexes = getStickyHeaderIndexes(renderRows).filter(
    (index) => args.groupBy !== 'repo' || renderRows[index]?.type === 'host-header'
  )
  return {
    renderRows,
    workspaceRows,
    projectWorkspaceRails,
    folderBackedProjectGroupIds,
    orderedHostIds,
    hostDrag,
    canReorderRepoHeaders,
    canReorderProjectGroupHeaders,
    sidebarRepoHeaderIdsByBucket: repoIdsByBucket,
    sidebarProjectGroupHeaderIdsByBucket: groupIdsByBucket,
    repoHeaderIndexByRepoId: repoLocations.indexById,
    repoHeaderBucketByRepoId: repoLocations.bucketById,
    projectGroupHeaderIndexByGroupId: groupLocations.indexById,
    projectGroupHeaderBucketByGroupId: groupLocations.bucketById,
    repoHeaderSectionEndByRepoId,
    projectGroupHeaderSectionEndByGroupId,
    firstHeaderIndex,
    stickyHeaderIndexes,
    repoDrag,
    projectGroupDrag
  }
}
