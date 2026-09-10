import { translate } from '~renderer/i18n/i18n'

export function sessionConflictScope(paths: readonly string[]): string {
  const labels = paths.map((path) => {
    const parts = path.split('.')
    switch (parts[0]) {
      case 'tabsByWorktree':
        return terminalTabConflictScope(parts.at(-1))
      case 'terminalLayoutsByTabId':
        return translate('session.scope.layout', 'terminal layout')
      case 'unifiedTabs':
        return translate('session.scope.order', 'tab order')
      case 'tabGroups':
      case 'tabGroupLayouts':
        return translate('session.scope.groups', 'tab groups')
      case 'openFilesByWorktree':
        return translate('session.scope.editors', 'editor tabs')
      default:
        return translate('session.scope.settings', 'workspace session settings')
    }
  })
  return [...new Set(labels)].join(', ')
}

function terminalTabConflictScope(field: string | undefined): string {
  switch (field) {
    case '$order':
    case 'sortOrder':
      return translate('session.scope.terminalOrder', 'terminal tab order')
    case 'customTitle':
    case 'defaultTitle':
    case 'title':
      return translate('session.scope.terminalTitles', 'terminal tab titles')
    case 'ptyId':
    case 'worktreeInstanceId':
      return translate('session.scope.terminalConnections', 'terminal connections')
    case 'color':
      return translate('session.scope.terminalColors', 'terminal tab colors')
    case 'launchAgent':
      return translate('session.scope.terminalAgents', 'terminal agent settings')
    default:
      return translate('session.scope.terminals', 'terminal tabs')
  }
}
