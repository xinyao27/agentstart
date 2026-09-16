export type ExtensionPage = 'activity' | 'mobile' | 'search' | 'settings' | 'skills'

// Why: only the workbench mounts these. A surface that cannot (the browser side
// panel) asks the workbench tab to open one instead of rendering a second host.
export type ExtensionShellModal =
  | 'add-repo'
  | 'delete-worktree'
  | 'new-workspace-composer'
  | 'setup-guide'

export type ExtensionPageIntent = ExtensionPage | ExtensionShellModal

/** Modal data a handoff can carry: it has to survive message passing and storage. */
export type ExtensionShellModalData = Record<string, boolean | number | readonly string[] | string>

export type ExtensionPageCommand = {
  data?: ExtensionShellModalData
  page: ExtensionPageIntent
}

export type ExtensionPageSubscription = (
  listener: (command: ExtensionPageCommand) => void
) => () => void

export type ExtensionWorkspaceTarget = {
  openInNewTab?: boolean
  projectId: string
  sessionId?: string
  worktreeId?: string
}

export type ExtensionHostNavigation = {
  openExternalUrl: (target: { projectId?: string; url: string }) => Promise<void>
  openPage: (page: ExtensionPage) => void
  openShellModal: (modal: ExtensionShellModal, data?: ExtensionShellModalData) => void
  openWorkspace: (target: ExtensionWorkspaceTarget) => void
  publishAgentAttention: (count: number) => void
  readActivePageUrl: () => Promise<string | null>
}

let hostNavigation: ExtensionHostNavigation | null = null

export function configureExtensionHostNavigation(navigation: ExtensionHostNavigation): void {
  hostNavigation = navigation
}

export function getExtensionHostNavigation(): ExtensionHostNavigation {
  if (!hostNavigation) {
    throw new Error('extension_navigation_not_configured')
  }
  return hostNavigation
}
