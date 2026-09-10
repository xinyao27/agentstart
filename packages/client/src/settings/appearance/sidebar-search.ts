import { translate } from '~renderer/i18n/i18n'
import { createLocalizedCatalog } from '~renderer/i18n/localized-catalog'

import type { SettingsSearchEntry } from '../search'
import { translateSearchKeyword } from '../search-keywords'

export const getLeftSidebarAppearanceEntry = createLocalizedCatalog((): SettingsSearchEntry => ({
  title: translate(
    'auto.components.settings.appearance.search.leftSidebarAppearance.title',
    'Left Sidebar Appearance'
  ),
  description: translate(
    'auto.components.settings.appearance.search.leftSidebarAppearance.description',
    'Make the left sidebar match your terminal, stay default, or use a tint.'
  ),
  keywords: [
    ...translateSearchKeyword('auto.components.settings.appearance.search.5bff6a2ef0', 'sidebar'),
    ...translateSearchKeyword(
      'auto.components.settings.appearance.search.leftSidebarAppearance.project',
      'project'
    ),
    ...translateSearchKeyword(
      'auto.components.settings.appearance.search.leftSidebarAppearance.terminal',
      'terminal'
    ),
    ...translateSearchKeyword(
      'auto.components.settings.appearance.search.leftSidebarAppearance.background',
      'background'
    ),
    ...translateSearchKeyword(
      'auto.components.settings.appearance.search.leftSidebarAppearance.tint',
      'tint'
    )
  ]
}))

export const getShowPinnedWorktreesInGroupsEntry = createLocalizedCatalog(
  (): SettingsSearchEntry => ({
    title: translate(
      'auto.components.settings.appearance.search.showPinnedWorktreesInGroups.title',
      'Also show pinned worktrees in their original lists'
    ),
    description: translate(
      'auto.components.settings.appearance.search.showPinnedWorktreesInGroups.description',
      'Pinned worktrees stay in Pinned and also appear in All, Project, Status, and Review.'
    ),
    keywords: [
      ...translateSearchKeyword(
        'auto.components.settings.appearance.search.showPinnedWorktreesInGroups.pinned',
        'pinned'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.appearance.search.showPinnedWorktreesInGroups.worktree',
        'worktree'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.appearance.search.showPinnedWorktreesInGroups.workspace',
        'workspace'
      ),
      ...translateSearchKeyword('auto.components.settings.appearance.search.5bff6a2ef0', 'sidebar'),
      ...translateSearchKeyword(
        'auto.components.settings.appearance.search.showPinnedWorktreesInGroups.original',
        'original'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.appearance.search.showPinnedWorktreesInGroups.group',
        'group'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.appearance.search.showPinnedWorktreesInGroups.duplicate',
        'duplicate'
      )
    ]
  })
)

export const getSidebarEntries = createLocalizedCatalog((): SettingsSearchEntry[] => [
  {
    title: translate(
      'auto.components.settings.appearance.search.1de96ec8a6',
      'Show AgentStart Mobile Button'
    ),
    description: translate(
      'auto.components.settings.appearance.search.682293cadf',
      'Show the AgentStart Mobile button at the top of the left sidebar.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.appearance.search.74618577c7', 'mobile'),
      ...translateSearchKeyword('auto.components.settings.appearance.search.5e5b8878bf', 'phone'),
      ...translateSearchKeyword('auto.components.settings.appearance.search.5bff6a2ef0', 'sidebar'),
      ...translateSearchKeyword('auto.components.settings.appearance.search.6cf5f54ce1', 'button'),
      ...translateSearchKeyword('auto.components.settings.appearance.search.648eeada79', 'hide'),
      ...translateSearchKeyword('auto.components.settings.appearance.search.ac79fe4a04', 'show'),
      ...translateSearchKeyword('auto.components.settings.appearance.search.839fb1e3ed', 'toolbox')
    ]
  },
  getLeftSidebarAppearanceEntry(),
  getShowPinnedWorktreesInGroupsEntry()
])
