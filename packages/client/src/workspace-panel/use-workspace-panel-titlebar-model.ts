import type { WorkspaceTitlebarActionId } from '@agentstart/protocol/settings/ui-state'
import type { ActiveWorkspacePanelTab } from '~renderer/editor/state'
import type { ShortcutKeyComboDetails } from '~renderer/keyboard-input/use-shortcut-label'

import type { ActivityBarItem } from './activity-bar-buttons'
import type {
  WorkspacePanelTitlebarDropTarget,
  WorkspaceTitlebarStripItem
} from './titlebar-strip-items'
import type { PanelTitlebarDragSource } from './use-workspace-panel-titlebar-pin-drag'

export type WorkspacePanelTitlebarModel = {
  worktreeId: string
  groupId: string
  visibleItems: WorkspaceTitlebarStripItem[]
  overflowItems: WorkspaceTitlebarStripItem[]
  activePanelId: ActiveWorkspacePanelTab | null
  dropTarget: WorkspacePanelTitlebarDropTarget
  isPanelDragActive: boolean
  resolvePanelIcon: (item: ActivityBarItem, active: boolean) => ActivityBarItem['icon']
  resolveItemIcon: (item: WorkspaceTitlebarStripItem, active: boolean) => ActivityBarItem['icon']
  shortcutFor: (id: ActiveWorkspacePanelTab) => ShortcutKeyComboDetails | null
  togglePanel: (id: ActiveWorkspacePanelTab) => void
  activateItem: (item: WorkspaceTitlebarStripItem) => void
  handleItemPointerDown: (
    event: React.PointerEvent,
    id: WorkspaceTitlebarActionId,
    source: PanelTitlebarDragSource
  ) => void
}
