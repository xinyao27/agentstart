import type { Tab, TabGroup } from '@yiru/protocol/workspace/tabs'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '~renderer/store/state'

import { tabGroupBodyAnchorName } from '../tab-group/body-anchor'
import EmulatorPane from './emulator-pane'

const EMPTY_UNIFIED_TABS: readonly Tab[] = []
const EMPTY_GROUPS: readonly TabGroup[] = []

type SimulatorOverlaySlotProps = {
  tab: Tab
  groupId: string | undefined
  isActive: boolean
  onFocusOwningGroup: ((groupId: string) => void) | undefined
}

const SimulatorOverlaySlot = function SimulatorOverlaySlot({
  tab,
  groupId,
  isActive,
  onFocusOwningGroup
}: SimulatorOverlaySlotProps): React.JSX.Element {
  const anchorName = groupId !== undefined ? tabGroupBodyAnchorName(groupId) : undefined
  const style: React.CSSProperties = (() =>
    anchorName
      ? {
          position: 'absolute',
          positionAnchor: anchorName,
          top: `anchor(${anchorName} top)`,
          left: `anchor(${anchorName} left)`,
          width: `anchor-size(${anchorName} width)`,
          height: `anchor-size(${anchorName} height)`,
          zIndex: isActive ? 2 : 1,
          visibility: isActive ? 'visible' : 'hidden',
          pointerEvents: isActive ? 'auto' : 'none'
        }
      : { display: 'none' })()

  return (
    <div
      style={style}
      className="yiru-emulator-overlay-slot min-h-0 min-w-0 overflow-hidden"
      onPointerDownCapture={() => {
        if (groupId && onFocusOwningGroup) {
          onFocusOwningGroup(groupId)
        }
      }}
    >
      <EmulatorPane tab={tab} worktreeId={tab.worktreeId} isActive={isActive} />
    </div>
  )
}

const EmulatorPaneOverlayLayer = function EmulatorPaneOverlayLayer({
  worktreeId,
  isWorktreeActive
}: {
  worktreeId: string
  isWorktreeActive: boolean
}): React.JSX.Element {
  const { unifiedTabs, groups } = useAppStore(
    useShallow((state) => ({
      unifiedTabs: state.unifiedTabsByWorktree[worktreeId] ?? EMPTY_UNIFIED_TABS,
      groups: state.groupsByWorktree[worktreeId] ?? EMPTY_GROUPS
    }))
  )
  const focusGroup = useAppStore((state) => state.focusGroup)
  const focusOwningGroup = (groupId: string) => focusGroup(worktreeId, groupId)

  const groupActiveTabById = (() => {
    const lookup: Record<string, string | null | undefined> = {}
    for (const group of groups) {
      lookup[group.id] = group.activeTabId
    }
    return lookup
  })()

  const simulatorTabs = (() => unifiedTabs.filter((t) => t.contentType === 'simulator'))()

  return (
    <>
      {simulatorTabs.map((tab) => {
        const isActiveInGroup = groupActiveTabById[tab.groupId] === tab.id
        const isActive = Boolean(isWorktreeActive && isActiveInGroup)
        return (
          <SimulatorOverlaySlot
            key={tab.id}
            tab={tab}
            groupId={tab.groupId}
            isActive={isActive}
            onFocusOwningGroup={focusOwningGroup}
          />
        )
      })}
    </>
  )
}

export default EmulatorPaneOverlayLayer
