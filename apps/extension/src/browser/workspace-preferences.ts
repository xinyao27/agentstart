import type { BrowserWorkspacePreferences } from '@agentstart/client/extension-bootstrap'

const FAVORITES_KEY = 'favoriteProjectIds'
const LAYOUT_KEY = 'workspaceWindowLayout'
const NEW_TAB_KEY = 'useNewTabLauncher'

export async function readWorkspacePreferences(): Promise<BrowserWorkspacePreferences> {
  const stored: unknown = await chrome.storage.sync.get([FAVORITES_KEY, LAYOUT_KEY, NEW_TAB_KEY])
  const favorites =
    typeof stored === 'object' && stored !== null ? Reflect.get(stored, FAVORITES_KEY) : null
  const layout =
    typeof stored === 'object' && stored !== null ? Reflect.get(stored, LAYOUT_KEY) : null
  return {
    favoriteProjectIds:
      Array.isArray(favorites) && favorites.every((value) => typeof value === 'string')
        ? [...new Set(favorites)].slice(0, 500)
        : [],
    layoutMode: layout === 'displays' ? 'displays' : 'cascade',
    useNewTabLauncher:
      typeof stored === 'object' && stored !== null && Reflect.get(stored, NEW_TAB_KEY) === true
  }
}

export async function setWorkspacePreferences(
  preferences: BrowserWorkspacePreferences
): Promise<void> {
  if (
    preferences.favoriteProjectIds.length > 500 ||
    !preferences.favoriteProjectIds.every((projectId) => projectId.length > 0) ||
    !['cascade', 'displays'].includes(preferences.layoutMode) ||
    typeof preferences.useNewTabLauncher !== 'boolean'
  ) {
    throw new Error('workspace_preferences_invalid')
  }
  await chrome.storage.sync.set({
    [FAVORITES_KEY]: [...new Set(preferences.favoriteProjectIds)],
    [LAYOUT_KEY]: preferences.layoutMode,
    [NEW_TAB_KEY]: preferences.useNewTabLauncher
  })
}
