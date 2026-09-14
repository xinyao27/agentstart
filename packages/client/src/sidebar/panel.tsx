import React from 'react'
import { lazyWithRetry } from '~renderer/application-shell/lazy-with-retry'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { SidebarStatusFooter } from '~renderer/status-bar/sidebar-footer'
import { useAppStore } from '~renderer/store/state'
import { cn } from '~renderer/ui/class-names'
import { TooltipProvider } from '~renderer/ui/tooltip'
import { SidebarResizeOverlay, useSidebarResize } from '~renderer/ui/use-resizable-sidebar'

import SidebarHeader from './header'
import SidebarNav from './nav'
import SetupScriptPromptCard from './setup-script-prompt-card'
import WorktreeList from './worktree-list'

const WorktreeMetaDialog = lazyWithRetry(() => import('./worktree-meta-dialog'))
const RemoveFolderDialog = lazyWithRetry(() => import('./remove-folder-dialog'))
const AgentStartYamlTrustDialog = lazyWithRetry(() => import('./agentstart-yaml-trust-dialog'))

const MIN_WIDTH = 240
const MAX_WIDTH = 500
const WORKTREE_SIDEBAR_RESIZE_HANDLE_CLASS_NAME =
  'group absolute bottom-0 z-10 flex w-3 cursor-col-resize items-stretch justify-center'
const WORKTREE_SIDEBAR_RESIZE_HANDLE_LINE_CLASS_NAME =
  'h-full w-px bg-transparent transition-colors group-hover:bg-ring/50 group-active:bg-ring'

type SidebarProps = {
  worktreeScrollOffsetRef: React.MutableRefObject<number>
  appearanceStyle?: React.CSSProperties
  navigationContent?: React.ReactNode
  placement?: 'left' | 'right'
  projectId?: string
  surface?: 'embedded-navigation' | 'navigation' | 'project-workspace' | 'workspace'
}

function Sidebar({
  worktreeScrollOffsetRef,
  appearanceStyle,
  navigationContent,
  placement = 'left',
  projectId,
  surface = 'workspace'
}: SidebarProps): React.JSX.Element {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const sidebarWidth = useAppStore((s) => s.sidebarWidth)
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth)
  const activeModal = useAppStore((s) => s.activeModal)
  const projectCatalog = useProjectCatalog()
  const isBrowserNavigationSurface = surface === 'navigation'
  const isEmbeddedNavigationSurface = surface === 'embedded-navigation'
  const isNavigationSurface = isBrowserNavigationSurface || isEmbeddedNavigationSurface
  const isProjectWorkspaceSurface = surface === 'project-workspace'
  const isOpen = isNavigationSurface || sidebarOpen

  const { containerRef, onResizeStart, isResizing, renderedWidth } =
    useSidebarResize<HTMLDivElement>({
      isOpen,
      width: sidebarWidth,
      minWidth: MIN_WIDTH,
      maxWidth: MAX_WIDTH,
      deltaSign: placement === 'left' ? 1 : -1,
      setWidth: setSidebarWidth
    })

  return (
    <TooltipProvider>
      <div
        ref={containerRef}
        // Why: no background of its own — the panel is a zone on whatever
        // surface hosts it (the big island's white in the workbench), and the
        // inner island's hairline is its separation. Sticky list headers
        // occlude via --worktree-sidebar-surface, which follows that host.
        className={cn(
          'worktree-sidebar-theme scrollbar-sleek-parent relative flex min-h-0 flex-shrink-0 flex-col',
          isNavigationSurface && 'h-full',
          isEmbeddedNavigationSurface && '[--worktree-sidebar-surface:var(--background)]'
        )}
        style={{ ...appearanceStyle, width: isBrowserNavigationSurface ? '100%' : renderedWidth }}
      >
        {/* Why: clip sidebar content without clipping the handle's titlebar extension. */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {isOpen && (
            <>
              {/* Fixed controls */}
              {!isProjectWorkspaceSurface ? <SidebarNav /> : null}
              {!isProjectWorkspaceSurface ? navigationContent : null}
              <SidebarHeader
                canCreateWorkspace={projectCatalog.repos.length > 0}
                projectId={isProjectWorkspaceSurface ? projectId : undefined}
                showAddProject={!isProjectWorkspaceSurface}
              />

              <WorktreeList
                navigationSurface={isNavigationSurface}
                projectId={isProjectWorkspaceSurface ? projectId : undefined}
                scrollOffsetRef={worktreeScrollOffsetRef}
              />

              <SetupScriptPromptCard />

              {/* Status footer */}
              {!isProjectWorkspaceSurface ? <SidebarStatusFooter /> : null}
            </>
          )}
        </div>

        {/* Resize handle */}
        {isOpen && !isBrowserNavigationSurface && (
          <div
            data-sidebar-resize-handle=""
            className={cn(
              WORKTREE_SIDEBAR_RESIZE_HANDLE_CLASS_NAME,
              isEmbeddedNavigationSurface ? 'top-0' : '-top-[var(--titlebar-height)]',
              placement === 'left' ? '-right-1.5' : '-left-1.5',
              isResizing && 'bg-ring/10'
            )}
            onMouseDown={onResizeStart}
          >
            <div
              className={cn(
                WORKTREE_SIDEBAR_RESIZE_HANDLE_LINE_CLASS_NAME,
                isResizing && 'bg-ring'
              )}
            />
          </div>
        )}
      </div>

      <SidebarResizeOverlay visible={isResizing} />

      {/* Dialogs render outside sidebar to avoid clipping. Lazy-load them only
      for the modal that needs their flow-specific hooks and UI. */}
      <React.Suspense fallback={null}>
        {activeModal === 'edit-meta' ? <WorktreeMetaDialog /> : null}
        {activeModal === 'confirm-remove-folder' ? <RemoveFolderDialog /> : null}
        {activeModal === 'confirm-agentstart-yaml-hooks' ? <AgentStartYamlTrustDialog /> : null}
      </React.Suspense>
    </TooltipProvider>
  )
}

export default Sidebar
