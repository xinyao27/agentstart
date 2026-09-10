import type { ProjectGroup } from '@agentstart/protocol/project/group-model'

import type { ProjectGroupHeaderDragSession } from './project-group-header-drag-contract'
import { getProjectGroupTabOrderUpdatesForSidebarDrop } from './project-group-header-drop'

export function commitProjectGroupHeaderDragDrop(args: {
  session: ProjectGroupHeaderDragSession
  sidebarDropIndex: number
  projectGroupById: ReadonlyMap<string, ProjectGroup>
  onCommitProjectGroupTabOrder: (groupId: string, tabOrder: number) => void
}): void {
  const updates = getProjectGroupTabOrderUpdatesForSidebarDrop({
    sidebarProjectGroupHeaderIds: args.session.sidebarProjectGroupHeaderIds,
    draggedGroupId: args.session.groupId,
    sidebarDropIndex: args.sidebarDropIndex,
    projectGroupById: args.projectGroupById
  })
  for (const update of updates) {
    args.onCommitProjectGroupTabOrder(update.groupId, update.tabOrder)
  }
}
