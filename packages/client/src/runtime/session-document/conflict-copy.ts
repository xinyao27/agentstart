import { translate } from '~renderer/i18n/i18n'

export function sessionConflictScope(paths: readonly string[]): string {
  const labels = paths.map((path) => {
    switch (path.split('.')[0]) {
      case 'tabsByWorktree':
        return translate('session.scope.terminals', 'terminal tabs')
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
