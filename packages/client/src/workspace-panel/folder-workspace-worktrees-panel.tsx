import type { Worktree } from '@agentstart/protocol/worktree/model'
import { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import WorktreeCard from '~renderer/sidebar/worktree-card'
import {
  getLineageChildrenInlineStyle,
  getLineageNestedRowGeometry
} from '~renderer/sidebar/worktree-list/indentation'
import { useAppStore } from '~renderer/store/state'

import { getAttachedWorktreesForFolderWorkspace } from './folder-workspace-attached-worktrees'

function stopNestedWorktreeCardBubble(event: React.SyntheticEvent<HTMLElement>): void {
  event.stopPropagation()
}

export default function FolderWorkspaceWorktreesPanel(): React.JSX.Element {
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const activeWorkspaceKey = useAppStore((s) => s.activeWorkspaceKey)
  const {
    folderWorkspaces,
    repos,
    workspaceLineageByChildKey,
    worktreeLineageById,
    worktreesByRepo
  } = useProjectCatalog()
  const [collapsedLineageWorktreeIds, setCollapsedLineageWorktreeIds] = useState<
    ReadonlySet<string>
  >(() => new Set())

  const repoById = new Map(repos.map((repo) => [repo.id, repo]))
  const { folderWorkspace, childWorktrees, lineageChildrenByParentId, rootChildWorktrees } =
    getAttachedWorktreesForFolderWorkspace({
      activeWorkspaceKey,
      activeWorktreeId,
      folderWorkspaces,
      workspaceLineageByChildKey,
      worktreeLineageById,
      worktreesByRepo
    })

  const toggleLineage = (worktreeId: string): void => {
    setCollapsedLineageWorktreeIds((current) => {
      const next = new Set(current)
      if (next.has(worktreeId)) {
        next.delete(worktreeId)
      } else {
        next.add(worktreeId)
      }
      return next
    })
  }

  const renderChildWorktree = (
    worktree: Worktree,
    ancestorIds: ReadonlySet<string> = new Set()
  ): React.JSX.Element => {
    const lineageChildren = lineageChildrenByParentId.get(worktree.id) ?? []
    const lineageCollapsed = collapsedLineageWorktreeIds.has(worktree.id)
    const nextAncestorIds = new Set([...ancestorIds, worktree.id])
    const safeLineageChildren = lineageChildren.filter((child) => !nextAncestorIds.has(child.id))
    const hasSafeLineageChildren = safeLineageChildren.length > 0
    const lineageGeometry = getLineageNestedRowGeometry()
    return (
      <WorktreeCard
        key={worktree.id}
        worktree={worktree}
        repo={repoById.get(worktree.repoId)}
        isActive={activeWorktreeId === worktree.id}
        isActiveSurface={false}
        hideRepoBadge={false}
        nativeDragEnabled={false}
        flushSurface
        contentIndent={lineageGeometry.cardContentIndent}
        affiliateListMode
        lineageChildCount={safeLineageChildren.length}
        lineageCollapsed={lineageCollapsed}
        lineageChildren={
          !lineageCollapsed && hasSafeLineageChildren
            ? safeLineageChildren.map((child) => (
                <div
                  key={child.id}
                  onClick={stopNestedWorktreeCardBubble}
                  onDoubleClick={stopNestedWorktreeCardBubble}
                  onDragStart={stopNestedWorktreeCardBubble}
                  style={
                    lineageGeometry.surfaceInset > 0
                      ? { paddingLeft: lineageGeometry.surfaceInset }
                      : undefined
                  }
                >
                  {renderChildWorktree(child, nextAncestorIds)}
                </div>
              ))
            : undefined
        }
        lineageChildrenStyle={
          hasSafeLineageChildren
            ? getLineageChildrenInlineStyle(lineageGeometry.lineageChildrenInlineOffset)
            : undefined
        }
        onLineageToggle={
          hasSafeLineageChildren
            ? (_groupKey, event) => {
                event.preventDefault()
                event.stopPropagation()
                toggleLineage(worktree.id)
              }
            : undefined
        }
        lineageToggleGroupKey={hasSafeLineageChildren ? worktree.id : undefined}
      />
    )
  }

  if (!folderWorkspace) {
    return (
      <div className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm">
        {translate(
          'auto.components.rightSidebar.FolderWorkspaceWorktreesPanel.unavailable',
          'Workspaces are only shown for folder workspaces.'
        )}
      </div>
    )
  }

  return (
    <div className="bg-background text-foreground flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-border border-b px-4 py-3">
        <div className="text-foreground truncate text-sm font-medium">{folderWorkspace.name}</div>
        <div className="text-muted-foreground mt-1 text-xs">
          {childWorktrees.length === 1
            ? translate(
                'auto.components.rightSidebar.FolderWorkspaceWorktreesPanel.countOne',
                '1 attached worktree'
              )
            : translate(
                'auto.components.rightSidebar.FolderWorkspaceWorktreesPanel.countMany',
                '{{value0}} attached worktrees',
                { value0: childWorktrees.length }
              )}
        </div>
      </div>

      {childWorktrees.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="text-foreground text-sm font-medium">
            {translate(
              'auto.components.rightSidebar.FolderWorkspaceWorktreesPanel.emptyTitle',
              'No attached worktrees yet'
            )}
          </div>
          <div className="text-muted-foreground mt-2 max-w-[16rem] text-xs leading-5">
            {translate(
              'auto.components.rightSidebar.FolderWorkspaceWorktreesPanel.emptyCopy',
              'Worktrees created from this workspace will show up here.'
            )}
          </div>
        </div>
      ) : (
        <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto py-2 pr-2 pl-1">
          <div className="space-y-1">
            {rootChildWorktrees.map((worktree) => renderChildWorktree(worktree))}
          </div>
        </div>
      )}
    </div>
  )
}
