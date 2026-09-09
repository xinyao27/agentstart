import type { ActiveRightSidebarTab } from '@yiru/protocol/settings/ui-state'
import { useEffect } from 'react'
import { useShortcutLabel } from '~renderer/keyboard-input/use-shortcut-label'
import { useAppStore } from '~renderer/store/state'
import { normalizeRightSidebarRoute } from '~renderer/workspace-panel/right-sidebar-route'

import { RightSidebarPanelContent } from './right-sidebar-panel-content'
import { showWorkspaceSidebar } from './show-sidebar'
import { WorkspaceSidebarFrame } from './sidebar-frame'
import { useRightSidebarActivityItems } from './use-right-sidebar-activity-items'

function WorkspaceSidebarInner(): React.JSX.Element | null {
  const toggleShortcut = useShortcutLabel('sidebar.right.toggle')
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const isOpen = useAppStore((state) => state.rightSidebarOpen)
  const width = useAppStore((state) => state.rightSidebarWidth)
  const worktreeSidebarOpen = useAppStore((state) => state.sidebarOpen)
  const worktreeSidebarWidth = useAppStore((state) => state.sidebarWidth)
  const activeView = useAppStore((state) => state.rightSidebarTab)
  const explorerView = useAppStore((state) => state.rightSidebarExplorerView)
  const activityBarPosition = useAppStore((state) => state.activityBarPosition)
  const setOpen = useAppStore((state) => state.setRightSidebarOpen)
  const setWidth = useAppStore((state) => state.setRightSidebarWidth)
  const setActiveView = useAppStore((state) => state.setRightSidebarTab)
  const setActivityBarPosition = useAppStore((state) => state.setActivityBarPosition)
  const { items } = useRightSidebarActivityItems(activeWorktreeId)
  const placement = 'left'
  const normalizedView = normalizeRightSidebarRoute(activeView).rightSidebarTab
  const effectiveView = items.some((item) => item.id === normalizedView)
    ? normalizedView
    : items[0]?.id

  useEffect(() => {
    if (effectiveView && effectiveView !== activeView) {
      setActiveView(effectiveView)
    }
  }, [activeView, effectiveView, setActiveView])

  if (!activeWorktreeId || !effectiveView) {
    return null
  }

  const selectView = (view: ActiveRightSidebarTab): void => {
    const isCurrentDestination =
      view === effectiveView && (view !== 'explorer' || explorerView === 'files')
    if (isCurrentDestination) {
      if (!isOpen) {
        setOpen(true)
      }
      return
    }
    if (view === 'explorer') {
      showWorkspaceSidebar({ view, worktreeId: activeWorktreeId })
      return
    }
    showWorkspaceSidebar({ view, worktreeId: activeWorktreeId })
  }

  return (
    <WorkspaceSidebarFrame
      activeView={effectiveView}
      activityBarPosition={activityBarPosition}
      isOpen={isOpen}
      items={items}
      onActivityBarPositionChange={setActivityBarPosition}
      onOpenChange={setOpen}
      onSelectView={selectView}
      onWidthChange={setWidth}
      placement={placement}
      reservedWorktreeSidebarWidth={worktreeSidebarOpen ? worktreeSidebarWidth : 0}
      toggleShortcut={toggleShortcut}
      width={width}
    >
      <RightSidebarPanelContent
        effectiveTab={effectiveView}
        rightSidebarOpen={isOpen}
        isVisible={isOpen}
      />
    </WorkspaceSidebarFrame>
  )
}

const WorkspaceSidebar = WorkspaceSidebarInner
export default WorkspaceSidebar
