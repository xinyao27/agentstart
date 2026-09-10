import type { AgentActivityDisplayMode } from '@agentstart/protocol/settings/ui-state'
import type { Tab, TerminalTab } from '@agentstart/protocol/workspace/tabs'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store/state'
import { cn } from '~renderer/ui/class-names'

import {
  WORKTREE_CARD_STATUS_GLYPH_NUDGE_PX,
  WORKTREE_CARD_STATUS_SLOT_WIDTH
} from '../worktree-list/indentation'
import { projectSidebarOpenTabs } from './open-tabs'
import { WorktreeCardTabRows } from './tab-row'

const EMPTY_GROUPS: ReturnType<typeof useAppStore.getState>['groupsByWorktree'][string] = []

type WorktreeCardTabsProps = {
  worktreeId: string
  tabs: readonly Tab[]
  terminalTabs: readonly TerminalTab[]
  displayMode: AgentActivityDisplayMode
  hasLeadingStatusIcon?: boolean
  inlineRailCardPaddingLeft?: string
  className?: string
}

type TabRailRow = {
  tabId: string
  visibleRowCount: number
}

type TabRowCenter = {
  tabId: string
  centerFromBottom: number
}

const STATUS_ICON_CENTER_LEFT_PX =
  WORKTREE_CARD_STATUS_SLOT_WIDTH / 2 + WORKTREE_CARD_STATUS_GLYPH_NUDGE_PX
const STATUS_ICON_CENTER_TOP_PX = 5 + WORKTREE_CARD_STATUS_SLOT_WIDTH / 2
const GLYPH_RADIUS_PX = 13 / 2
const LAST_TAB_ROW_CENTER_FROM_BOTTOM_PX = 6 + 12
const TAB_LIST_LEFT_PX = WORKTREE_CARD_STATUS_SLOT_WIDTH + 4 + 2 - 4
const TAB_ROW_ICON_LEFT_FROM_LIST_LEFT_PX = 4
const RAIL_ICON_GAP_PX = 6
const RAIL_TOP_PX = STATUS_ICON_CENTER_TOP_PX + GLYPH_RADIUS_PX + RAIL_ICON_GAP_PX
const RAIL_ELBOW_WIDTH_PX =
  TAB_LIST_LEFT_PX +
  TAB_ROW_ICON_LEFT_FROM_LIST_LEFT_PX -
  STATUS_ICON_CENTER_LEFT_PX -
  RAIL_ICON_GAP_PX
const COMPACT_TAB_ROW_HEIGHT_PX = 24

function getTabRowCentersFromBottom(rootRows: readonly TabRailRow[]): TabRowCenter[] {
  const totalRenderedRows = rootRows.reduce((total, row) => total + row.visibleRowCount, 0)
  let rowsAbove = 0
  return rootRows.map((row) => {
    const rowsBelow = totalRenderedRows - rowsAbove - 1
    rowsAbove += row.visibleRowCount
    return {
      tabId: row.tabId,
      centerFromBottom: LAST_TAB_ROW_CENTER_FROM_BOTTOM_PX + rowsBelow * COMPACT_TAB_ROW_HEIGHT_PX
    }
  })
}

function SidebarTabRail(props: {
  cardPaddingLeft: string
  rootRows: readonly TabRailRow[]
}): React.JSX.Element {
  const { cardPaddingLeft, rootRows } = props
  const left = `calc(${cardPaddingLeft} + ${STATUS_ICON_CENTER_LEFT_PX}px)`
  const rowCenters = (() => getTabRowCentersFromBottom(rootRows))()
  const lastRowCenter = rowCenters.at(-1)?.centerFromBottom ?? LAST_TAB_ROW_CENTER_FROM_BOTTOM_PX

  return (
    <>
      <span
        aria-hidden="true"
        className="bg-sidebar-border pointer-events-none absolute z-10 w-px transition-[bottom] duration-150 ease-out motion-reduce:transition-none"
        style={{ left, top: RAIL_TOP_PX, bottom: lastRowCenter }}
      />
      {rowCenters.map((row) => (
        <span
          key={row.tabId}
          aria-hidden="true"
          className="bg-sidebar-border pointer-events-none absolute z-10 h-px transition-[bottom] duration-150 ease-out motion-reduce:transition-none"
          style={{
            left,
            bottom: row.centerFromBottom,
            width: RAIL_ELBOW_WIDTH_PX
          }}
        />
      ))}
    </>
  )
}

export const WorktreeCardTabs = function WorktreeCardTabs(
  props: WorktreeCardTabsProps
): React.JSX.Element | null {
  const {
    worktreeId,
    tabs,
    terminalTabs,
    displayMode,
    hasLeadingStatusIcon = false,
    inlineRailCardPaddingLeft,
    className
  } = props
  const groups = useAppStore((state) => state.groupsByWorktree[worktreeId] ?? EMPTY_GROUPS)
  const layout = useAppStore((state) => state.layoutByWorktree[worktreeId])
  const activeGroupId = useAppStore((state) => state.activeGroupIdByWorktree[worktreeId])
  const generatedTitlesEnabled = useAppStore(
    (state) => state.settings?.tabAutoGenerateTitle === true
  )
  const rows = (() => projectSidebarOpenTabs({ tabs, groups, layout, activeGroupId }))()
  const railRows = (() => rows.map((row) => ({ tabId: row.tab.id, visibleRowCount: 1 })))()
  const stopPropagation = (event: React.SyntheticEvent) => event.stopPropagation()

  if (rows.length === 0) {
    return null
  }
  return (
    <>
      {inlineRailCardPaddingLeft && displayMode === 'compact' ? (
        <SidebarTabRail cardPaddingLeft={inlineRailCardPaddingLeft} rootRows={railRows} />
      ) : null}
      <div
        className={cn(
          displayMode === 'compact'
            ? cn(
                'mt-1 flex flex-col',
                hasLeadingStatusIcon
                  ? '-ms-1 w-[calc(100%+0.25rem)]'
                  : '-ms-2 w-[calc(100%+0.5rem)]'
              )
            : 'mt-1 flex flex-col',
          className
        )}
        role="tablist"
        aria-label={translate('auto.components.sidebar.WorktreeCardTabs.openTabs', 'Open tabs')}
        onClick={stopPropagation}
        onDoubleClick={stopPropagation}
        onMouseDown={stopPropagation}
        onPointerDown={stopPropagation}
      >
        <WorktreeCardTabRows
          worktreeId={worktreeId}
          rows={rows}
          terminalTabs={terminalTabs}
          generatedTitlesEnabled={generatedTitlesEnabled}
          displayMode={displayMode}
        />
      </div>
    </>
  )
}
