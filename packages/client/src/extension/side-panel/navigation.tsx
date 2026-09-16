import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useProjectCatalog } from '~renderer/project-catalog/provider'

import Sidebar from '../../sidebar/panel'
import { AgentMonitor } from '../agent-status/monitor'
import { AwayReplay } from '../away-replay/panel'
import { ContextInbox } from '../context/inbox'
import { ContextProjects } from '../context/projects'
import { hydrateSidePanelNavigation } from './hydration'
import { getSidePanelPresenceSnapshot, subscribeSidePanelPresence } from './presence'

type SidePanelNavigationProps = {
  presentation: 'browser' | 'workbench'
}

export function SidePanelNavigation({ presentation }: SidePanelNavigationProps): React.JSX.Element {
  const worktreeScrollOffsetRef = useRef(0)
  const hasHydratedRef = useRef(false)
  const projectCatalog = useProjectCatalog()
  useEffect(() => {
    // Why: the workbench shell owns startup session hydration. Running the
    // side-panel read here as well races that restore and can observe its
    // first pending write as a false startup conflict.
    if (presentation !== 'browser' || projectCatalog.isPending || hasHydratedRef.current) {
      return
    }
    hasHydratedRef.current = true
    void hydrateSidePanelNavigation(projectCatalog.repos, projectCatalog.runtimeEnvironments).catch(
      (error: unknown) => {
        // Why: this read runs against a daemon that may still be starting, and the
        // panel keeps its unhydrated surface on failure — a missed deadline here
        // must be reported, not escape as an unhandled renderer rejection.
        console.warn('[extension] side panel navigation hydration failed:', error)
      }
    )
  }, [
    presentation,
    projectCatalog.isPending,
    projectCatalog.repos,
    projectCatalog.runtimeEnvironments
  ])

  return (
    <Sidebar
      placement="right"
      surface={presentation === 'browser' ? 'navigation' : 'embedded-navigation'}
      worktreeScrollOffsetRef={worktreeScrollOffsetRef}
      navigationContent={
        <>
          <AgentMonitor />
          <AwayReplay />
          <ContextInbox />
          <ContextProjects />
        </>
      }
    />
  )
}

export function EmbeddedSidePanelNavigation(): React.JSX.Element | null {
  const extensionSidePanelOpen = useSyncExternalStore(
    subscribeSidePanelPresence,
    getSidePanelPresenceSnapshot,
    getSidePanelPresenceSnapshot
  )

  return extensionSidePanelOpen ? null : <SidePanelNavigation presentation="workbench" />
}
