import type { Repo } from '@agentstart/protocol/project/repository'
import { folderWorkspaceToWorktree } from '@agentstart/protocol/workspace/folder'
import { isConfirmedStaleFolderPathStatus } from '@agentstart/protocol/workspace/folder-path'
import type { WorktreeLineage, WorkspaceLineage } from '@agentstart/protocol/worktree/lineage'
import type { Worktree } from '@agentstart/protocol/worktree/model'
import type React from 'react'
import type { AppState } from '~renderer/store/types'

import { getFolderWorkspaceCardPrDisplay } from '../folder-workspace-card-pr-display'
import { ProjectWorkspaceRailRow } from '../project-workspace-rail'
import WorktreeCard from '../worktree-card'
import type { WorktreeGroupBy } from './groups'
import { getFolderWorkspaceRowGeometry } from './indentation'
import { getWorktreeOptionId } from './reveal'
import type { FolderWorkspaceItemRow } from './row-model'
import { FolderPathStatusIndicator } from './section-rows'

export function FolderRow(props: {
  row: FolderWorkspaceItemRow
  virtualKey: React.Key
  index: number
  projectRail?: {
    segment: 'header' | 'workspace'
    leftPx: number
    elbowWidthPx?: number
    endsSection?: boolean
  }
  groupBy: WorktreeGroupBy
  activeWorktreeId: string | null
  currentWorktreeId: string | null
  selectedWorktreeIds: ReadonlySet<string>
  workspaceLineageByChildKey: Record<string, WorkspaceLineage>
  worktreeLineageById: Record<string, WorktreeLineage>
  worktreeMap: Map<string, Worktree>
  repoMap: Map<string, Repo>
  hostedReviewCache: AppState['hostedReviewCache'] | null
  prCache: AppState['prCache'] | null
  settings: AppState['settings']
  pathStatus: ReturnType<AppState['getFreshFolderWorkspacePathStatus']>
  onImmediateActivate: (worktreeId: string, rowKey: string | undefined) => void
  onSelectionGesture: (event: React.MouseEvent<HTMLElement>, worktreeId: string) => boolean
  onContextMenuSelect: (
    event: React.MouseEvent<HTMLElement>,
    worktree: Worktree
  ) => readonly Worktree[]
  onRowPointerDown: (
    event: React.PointerEvent<HTMLDivElement>,
    worktreeId: string,
    rowKey: string
  ) => void
  onRowClickCapture: (event: React.MouseEvent<HTMLDivElement>) => void
}): React.JSX.Element {
  const worktree = folderWorkspaceToWorktree(props.row.folderWorkspace)
  const activationDisabled =
    props.pathStatus?.exists === false && isConfirmedStaleFolderPathStatus(props.pathStatus)
  const prDisplay = getFolderWorkspaceCardPrDisplay({
    folderWorkspaceId: props.row.folderWorkspace.id,
    workspaceLineageByChildKey: props.workspaceLineageByChildKey,
    worktreeLineageById: props.worktreeLineageById,
    worktreeMap: props.worktreeMap,
    repoMap: props.repoMap,
    hostedReviewCache: props.hostedReviewCache,
    prCache: props.prCache,
    settings: props.settings
  })
  const { surfaceInset, cardContentIndent } = getFolderWorkspaceRowGeometry({
    isFolderBackedWorkspaceChild:
      props.groupBy === 'repo' && props.row.projectGroup.createdFrom === 'folder-scan',
    isGrouped: props.groupBy !== 'none',
    groupDepth: props.row.groupDepth,
    lineageDepth: props.row.depth
  })
  return (
    <div
      id={getWorktreeOptionId(worktree.id)}
      role="option"
      aria-selected={props.selectedWorktreeIds.has(worktree.id)}
      aria-current={props.activeWorktreeId === worktree.id ? 'page' : undefined}
      data-worktree-id={worktree.id}
      data-worktree-row-key={worktree.id}
      data-worktree-virtual-row
      data-worktree-virtual-row-key={String(props.virtualKey)}
      data-index={props.index}
      className="relative"
      onClickCapture={props.onRowClickCapture}
      onPointerDown={(event) => props.onRowPointerDown(event, worktree.id, worktree.id)}
    >
      {props.projectRail?.segment === 'workspace' ? (
        <ProjectWorkspaceRailRow
          leftPx={props.projectRail.leftPx}
          elbowWidthPx={props.projectRail.elbowWidthPx}
          endsSection={props.projectRail.endsSection}
        />
      ) : null}
      <div
        className="relative"
        style={surfaceInset > 0 ? { paddingLeft: surfaceInset } : undefined}
      >
        <WorktreeCard
          worktree={worktree}
          repo={undefined}
          isActive={props.activeWorktreeId === worktree.id}
          isCurrentWorktree={props.currentWorktreeId === worktree.id}
          contentIndent={cardContentIndent}
          flushSurface
          nativeDragEnabled={false}
          onImmediateActivate={activationDisabled ? undefined : props.onImmediateActivate}
          activationRowKey={worktree.id}
          onSelectionGesture={props.onSelectionGesture}
          onContextMenuSelect={props.onContextMenuSelect}
          statusPrDisplay={prDisplay}
        />
        <div className="pointer-events-auto absolute top-1.5 right-3">
          <FolderPathStatusIndicator status={props.pathStatus} />
        </div>
      </div>
    </div>
  )
}
