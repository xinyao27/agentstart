import type { ActiveRightSidebarTab } from '~renderer/editor/state'

import type { ActivityBarItem } from './activity-bar-buttons'

export type WorkspaceTitlebarStripItem =
  | { id: ActiveRightSidebarTab; kind: 'panel'; panel: ActivityBarItem }
  | { id: 'open-in'; kind: 'open-in'; title: string }
  | { id: 'commands'; kind: 'commands'; title: string }

/** `number` = insert-before gap (0..visibleCount); `more` = unpin into overflow. */
export type WorkspacePanelTitlebarDropTarget = 'more' | number | null
