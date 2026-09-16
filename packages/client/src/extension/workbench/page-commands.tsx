import { useEffect, useRef } from 'react'

import { useAppStore } from '../../store/state'
import { openCommandPalette } from '../command-palette/open'
import type {
  ExtensionPageCommand,
  ExtensionPageIntent,
  ExtensionPageSubscription,
  ExtensionShellModalData
} from '../navigation'

export function WorkbenchPageCommandBridge({
  subscribe
}: {
  subscribe: ExtensionPageSubscription
}): null {
  const isReady = useAppStore((state) => state.persistedUIReady && state.workspaceSessionReady)
  const pendingCommandsRef = useRef<ExtensionPageCommand[]>([])

  useEffect(
    () =>
      subscribe((command) => {
        pendingCommandsRef.current.push(command)
        const state = useAppStore.getState()
        if (state.persistedUIReady && state.workspaceSessionReady) {
          flushPendingCommands(pendingCommandsRef.current)
        }
      }),
    [subscribe]
  )
  useEffect(() => {
    if (isReady) {
      flushPendingCommands(pendingCommandsRef.current)
    }
  }, [isReady])
  return null
}

export function openWorkbenchDestination(
  intent: ExtensionPageIntent,
  data?: ExtensionShellModalData
): void {
  const state = useAppStore.getState()
  switch (intent) {
    case 'activity':
      state.openPageTab('home')
      return
    case 'mobile':
      state.openPageTab('mobile')
      return
    case 'search':
      openCommandPalette()
      return
    case 'settings':
      state.openSettingsPage()
      return
    case 'skills':
      state.openPageTab('skills')
      return
    // Why: the sidebar reaches these through the host so a surface that cannot
    // mount shell modals still lands the user in the workbench flow. A request
    // from another surface is not a contextual-tour click, so it skips the
    // workspace-creation tour handoff the sidebar takes in this document.
    case 'add-repo':
    case 'delete-worktree':
    case 'new-workspace-composer':
    case 'setup-guide':
      state.openModal(intent, data)
  }
}

function flushPendingCommands(commands: ExtensionPageCommand[]): void {
  for (const command of commands.splice(0)) {
    openWorkbenchDestination(command.page, command.data)
  }
}
