import type { WorkspaceTitlebarActionId } from '@yiru/protocol/settings/ui-state'
import type { ActiveRightSidebarTab } from '~renderer/editor/state'
import type { ShortcutKeyComboDetails } from '~renderer/keyboard-input/use-shortcut-label'

import type { ActivityBarItem } from './activity-bar-buttons'
import type {
  WorkspacePanelTitlebarDropTarget,
  WorkspaceTitlebarStripItem
} from './titlebar-strip-items'
import type { PanelTitlebarDragSource } from './use-workspace-panel-titlebar-pin-drag'

export type {
  WorkspacePanelTitlebarDropTarget,
  WorkspaceTitlebarStripItem
} from './titlebar-strip-items'

export type WorkspacePanelTitlebarModel = {
  worktreeId: string
  groupId: string
  visibleItems: WorkspaceTitlebarStripItem[]
  overflowItems: WorkspaceTitlebarStripItem[]
  activePanelId: ActiveRightSidebarTab | null
  dropTarget: WorkspacePanelTitlebarDropTarget
  isPanelDragActive: boolean
  resolvePanelIcon: (item: ActivityBarItem, active: boolean) => ActivityBarItem['icon']
  resolveItemIcon: (item: WorkspaceTitlebarStripItem, active: boolean) => ActivityBarItem['icon']
  shortcutFor: (id: ActiveRightSidebarTab) => ShortcutKeyComboDetails | null
  togglePanel: (id: ActiveRightSidebarTab) => void
  activateItem: (item: WorkspaceTitlebarStripItem) => void
  handleItemPointerDown: (
    event: React.PointerEvent,
    id: WorkspaceTitlebarActionId,
    source: PanelTitlebarDragSource
  ) => void
}
