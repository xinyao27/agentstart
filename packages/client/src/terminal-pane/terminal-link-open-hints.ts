import { translate } from '~renderer/i18n/i18n'

export function isMacPlatform(): boolean {
  return navigator.userAgent.includes('Mac')
}

export function getTerminalFileOpenHint(): string {
  return isMacPlatform()
    ? '⌘+click to open or ⇧⌘+click for default app'
    : 'Ctrl+click to open or Shift+Ctrl+click for default app'
}

export function getTerminalAgentStartFileOpenHint(): string {
  return isMacPlatform() ? '⌘+click to open in AgentStart' : 'Ctrl+click to open in AgentStart'
}

// Why: detected local .html/.htm file paths keep the same modifier gate as
// other file-path links, with Shift+modifier as the system-browser escape hatch.
export function getTerminalHtmlFileOpenHint(): string {
  return isMacPlatform()
    ? '⌘+click to open or ⇧⌘+click for default browser'
    : 'Ctrl+click to open or Shift+Ctrl+click for default browser'
}

export function getTerminalUrlOpenHint(): string {
  return isMacPlatform()
    ? translate(
        'components.terminalPane.urlLinkHint.mac',
        '⌘+click for default browser or ⇧⌘+click for AgentStart Browser'
      )
    : translate(
        'components.terminalPane.urlLinkHint.other',
        'Ctrl+click for default browser or Shift+Ctrl+click for AgentStart Browser'
      )
}

export function getTerminalWorktreePathOpenHint(canOpenWithSystemDefault: boolean): string {
  if (!canOpenWithSystemDefault) {
    return isMacPlatform() ? '⌘+click to switch workspace' : 'Ctrl+click to switch workspace'
  }

  return isMacPlatform()
    ? '⌘+click to switch workspace or ⇧⌘+click to open in Finder'
    : 'Ctrl+click to switch workspace or Shift+Ctrl+click to open folder'
}
