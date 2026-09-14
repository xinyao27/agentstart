export type ExtensionPage = 'activity' | 'mobile' | 'search' | 'settings' | 'skills'

export type ExtensionPageSubscription = (listener: (page: ExtensionPage) => void) => () => void

export type ExtensionWorkspaceTarget = {
  openInNewTab?: boolean
  projectId: string
  sessionId?: string
  worktreeId?: string
}

export type ExtensionHostNavigation = {
  openExternalUrl: (target: { projectId?: string; url: string }) => Promise<void>
  openPage: (page: ExtensionPage) => void
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
