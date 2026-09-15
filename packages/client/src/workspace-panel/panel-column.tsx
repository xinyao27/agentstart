import {
  WORKSPACE_PANEL_MIN_WIDTH,
  clampWorkspacePanelWidth,
  computeMaxWorkspacePanelWidth
} from '@agentstart/protocol/settings/workspace-panel'
import { useEffect, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store/state'
import { cn } from '~renderer/ui/class-names'
import { SidebarResizeOverlay, useSidebarResize } from '~renderer/ui/use-resizable-sidebar'

import { WorkspacePanelContent } from './workspace-panel-content'

const RESIZE_HANDLE_CLASS_NAME =
  'group absolute top-0 bottom-0 z-10 -right-1.5 flex w-3 cursor-col-resize items-stretch justify-center'
const RESIZE_HANDLE_LINE_CLASS_NAME =
  'h-full w-px bg-transparent transition-colors group-hover:bg-ring/50 group-active:bg-ring'

/**
 * The workspace tool panel as a column left of the content area.
 *
 * Why it is a column and not an overlay: the panel exists to feed the content
 * area — picking a file, a diff, or a session opens a tab — so it must stay
 * visible while that tab is on screen instead of being dismissed to reveal it.
 * Its container repeats the navigation sidebar's treatment on purpose: no
 * background of its own (it is a zone on the content card), the same drag
 * handle, and the content island's own edge as the separation.
 */
export function WorkspacePanelColumn(): React.JSX.Element {
  const workspacePanelOpen = useAppStore((state) => state.workspacePanelOpen)
  const workspacePanelTab = useAppStore((state) => state.workspacePanelTab)
  const workspacePanelWidth = useAppStore((state) => state.workspacePanelWidth)
  const setWorkspacePanelWidth = useAppStore((state) => state.setWorkspacePanelWidth)
  // Why: the column's ceiling has to follow the space it actually sits in. A
  // fixed max let a persisted wide column overflow the content card, which
  // clipped the panel's own right edge instead of shrinking the panel.
  const [layoutWidth, setLayoutWidth] = useState<number | null>(null)
  const maxPanelWidth = computeMaxWorkspacePanelWidth(layoutWidth ?? 0)
  const renderedPanelWidth = clampWorkspacePanelWidth(workspacePanelWidth, layoutWidth ?? undefined)
  const { containerRef, isResizing, onResizeStart, renderedWidth } =
    useSidebarResize<HTMLDivElement>({
      isOpen: true,
      width: renderedPanelWidth,
      minWidth: WORKSPACE_PANEL_MIN_WIDTH,
      maxWidth: maxPanelWidth,
      deltaSign: 1,
      setWidth: setWorkspacePanelWidth
    })

  useEffect(() => {
    const container = containerRef.current
    // Why: the parent is the content card — the space this column shares with
    // the workbench and the navigation sidebar.
    const layout = container?.parentElement
    if (!layout) {
      return
    }

    const updateMaxWidth = (): void => {
      setLayoutWidth(layout.clientWidth)
    }

    updateMaxWidth()
    const observer = new ResizeObserver(updateMaxWidth)
    observer.observe(layout)
    return () => observer.disconnect()
  }, [containerRef])

  return (
    <>
      <div
        ref={containerRef}
        style={{ width: renderedWidth }}
        // Why: min-w-0 is load-bearing. As a `shrink-0` flex item the column
        // defaults to `min-width: auto`, so a panel whose content cannot shrink
        // below its own min-content width widened the column past the persisted
        // value and pushed the workbench out of the content card. The width here
        // is the only authority; content adapts to it and clips inside the
        // overflow-hidden wrapper below.
        className="worktree-sidebar-theme scrollbar-sleek-parent relative flex min-h-0 min-w-0 shrink-0 flex-col [--worktree-sidebar-surface:var(--background)]"
      >
        {/* Why: clip panel content without clipping the handle's overhang. */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <WorkspacePanelContent
            effectiveTab={workspacePanelTab}
            workspacePanelOpen={workspacePanelOpen}
            isVisible
          />
        </div>

        <div
          data-workspace-panel-resize-handle=""
          className={cn(RESIZE_HANDLE_CLASS_NAME, isResizing && 'bg-ring/10')}
          role="separator"
          aria-orientation="vertical"
          aria-label={translate('auto.components.workspacePanel.toolTabs.label', 'Workspace tools')}
          onMouseDown={onResizeStart}
        >
          <div className={cn(RESIZE_HANDLE_LINE_CLASS_NAME, isResizing && 'bg-ring')} />
        </div>
      </div>

      <SidebarResizeOverlay visible={isResizing} />
    </>
  )
}
