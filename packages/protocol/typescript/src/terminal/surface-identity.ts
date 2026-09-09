// Why: this value is persisted in tab ids; changing the legacy wire prefix would orphan sessions.
export const REMOTE_TERMINAL_SURFACE_TAB_PREFIX = 'web-terminal-'
export const HOST_TERMINAL_SURFACE_SEPARATOR = '::'

export function toRemoteTerminalSurfaceTabId(hostSurfaceId: string): string {
  // Why: host session surface ids use `tab::leaf`, but renderer pane keys
  // reserve `:` as the tab/leaf delimiter. Keep host identity while making a
  // local tab id that can safely flow through makePaneKey().
  return `${REMOTE_TERMINAL_SURFACE_TAB_PREFIX}${encodeURIComponent(hostSurfaceId)}`
}

export function toHostSessionTabId(tabId: string): string {
  if (!tabId.startsWith(REMOTE_TERMINAL_SURFACE_TAB_PREFIX)) {
    return tabId
  }
  try {
    return decodeURIComponent(tabId.slice(REMOTE_TERMINAL_SURFACE_TAB_PREFIX.length))
  } catch {
    return tabId
  }
}

export function isRemoteTerminalSurfaceTabId(tabId: string): boolean {
  return tabId.startsWith(REMOTE_TERMINAL_SURFACE_TAB_PREFIX)
}
