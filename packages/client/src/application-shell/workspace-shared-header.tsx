import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { TabSurfaceProvider } from '~renderer/tab-bar/tab-surfaces'

import { AppScopeStrip } from './app-scope-strip'
import { NavigationSidebarToggle } from './navigation-sidebar-toggle'

type WorkspaceSharedHeaderContextValue = {
  target: HTMLDivElement | null
  setTarget: (target: HTMLDivElement | null) => void
}

const WorkspaceSharedHeaderContext = createContext<WorkspaceSharedHeaderContextValue | null>(null)

export function WorkspaceSharedHeaderProvider({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const [target, setTargetState] = useState<HTMLDivElement | null>(null)
  const setTarget = useCallback((nextTarget: HTMLDivElement | null): void => {
    setTargetState(nextTarget)
  }, [])
  const value = useMemo(() => ({ target, setTarget }), [setTarget, target])

  return (
    <WorkspaceSharedHeaderContext.Provider value={value}>
      {children}
    </WorkspaceSharedHeaderContext.Provider>
  )
}

type WorkspaceSharedHeaderSlotProps = {
  /**
   * Why: the workspace strip portals into the slot's target, so page tabs ride
   * that queue whenever a workspace is open. With no workspace there is no group
   * to portal, and the app scope's own strip hosts the titlebar instead — the
   * same strip chrome, driven by the app scope's page-only queue.
   */
  showAppScopeStrip: boolean
}

export function WorkspaceSharedHeaderSlot({
  showAppScopeStrip
}: WorkspaceSharedHeaderSlotProps): React.JSX.Element {
  const { setTarget } = useWorkspaceSharedHeaderContext()

  return (
    // Why: the header is the chrome plane's own top row, not an island on it —
    // the row paints no surface of its own, so the plane shows behind the tabs
    // and the selected tab's silhouette can flare across the row's baseline
    // into the content card, which starts flush beneath it. relative + z-10
    // keeps the silhouette above the card's own shadow, so the join stays free
    // of paint.
    <div
      className="relative z-10 flex h-[var(--titlebar-height)] shrink-0 items-stretch"
      data-workspace-shared-header=""
    >
      {/* Why: exactly one strip occupies the row. A workspace strip fills the
          slot by portaling into the target, and sets its own plane scope where
          it portals; with no workspace there is no group to portal, so the app
          scope's strip takes the row outright and the target stays unmounted
          rather than splitting the width with it. */}
      {showAppScopeStrip ? (
        <TabSurfaceProvider scope="plane">
          <AppScopeStrip />
        </TabSurfaceProvider>
      ) : (
        <div ref={setTarget} className="relative flex min-w-0 flex-1 items-stretch" />
      )}
      {/* Why: shell navigation, not a workspace action — the toggle sits after
          whichever strip occupies the row so its position never moves between
          the two cases. */}
      <NavigationSidebarToggle />
    </div>
  )
}

export function useWorkspaceSharedHeaderTarget(): HTMLDivElement | null {
  return useWorkspaceSharedHeaderContext().target
}

function useWorkspaceSharedHeaderContext(): WorkspaceSharedHeaderContextValue {
  const context = useContext(WorkspaceSharedHeaderContext)
  if (!context) {
    throw new Error('WorkspaceSharedHeaderProvider is required for shared Header content.')
  }
  return context
}
