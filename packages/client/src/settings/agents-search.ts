import { getAgentCatalog } from '~renderer/agent/catalog'
import { translate } from '~renderer/i18n/i18n'
import { createLocalizedCatalog } from '~renderer/i18n/localized-catalog'

import {
  getAgentAwakeDescription,
  getAgentAwakeSearchKeywords,
  getAgentAwakeTitle
} from './agent/awake-copy'
import { getAgentCacheTimerSearchEntries } from './agent/cache-timer-search'
import {
  getAgentGeneratedTabTitlesDescription,
  getAgentGeneratedTabTitlesSearchKeywords,
  getAgentGeneratedTabTitlesTitle
} from './agent/generated-tab-title-copy'
import {
  getAgentStatusHooksDescription,
  getAgentStatusHooksSearchKeywords,
  getAgentStatusHooksTitle
} from './agent/status-hooks-copy'
import type { SettingsSearchEntry } from './search'
import { searchKeywords, translateSearchKeyword, uniqueKeywords } from './search-keywords'

function buildAgentSettingsKeywords(): string[] {
  const keywords = searchKeywords([
    { key: 'auto.components.settings.agents.search.96ba2373b6', fallback: 'agent' },
    { key: 'auto.components.settings.agents.search.d8f3a8b8a0', fallback: 'default' },
    { key: 'auto.components.settings.agents.search.167daeb5e9', fallback: 'command' },
    { key: 'auto.components.settings.agents.search.be59907510', fallback: 'override' },
    { key: 'auto.components.settings.agents.search.a6d594c17d', fallback: 'install' },
    { key: 'auto.components.settings.agents.search.f2932bf22b', fallback: 'detected' },
    { key: 'auto.components.settings.agents.search.2afd3b5858', fallback: 'enable' },
    { key: 'auto.components.settings.agents.search.60393e1b17', fallback: 'disable' },
    { key: 'auto.components.settings.agents.search.2e188c771c', fallback: 'hide' },
    { key: 'auto.components.settings.agents.search.87fffe6c20', fallback: 'show' },
    { key: 'auto.components.settings.agents.search.permission', fallback: 'permission' },
    { key: 'auto.components.settings.agents.search.permissions', fallback: 'permissions' },
    { key: 'auto.components.settings.agents.search.yolo', fallback: 'yolo', englishOnly: true },
    { key: 'auto.components.settings.agents.search.manual', fallback: 'manual' },
    {
      key: 'auto.components.settings.agents.search.e2b7c0dcd7',
      fallback: 'github',
      englishOnly: true
    }
  ])

  for (const agent of getAgentCatalog()) {
    keywords.push(...expandAgentSearchText(agent.id), ...expandAgentSearchText(agent.label))
    keywords.push(...expandAgentSearchText(agent.cmd))
  }

  return uniqueKeywords(keywords)
}

function expandAgentSearchText(value: string): string[] {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()

  return spaced === value ? [value] : [value, spaced]
}

type AgentsPaneSearchOptions = {
  includeAgentRuntime?: boolean
}

const AGENT_RUNTIME_SEARCH_ENTRY_ID = 'agent-runtime'

// Why: one catalog per accordion group so the pane cards can declare their own
// search entries while getAgentsPaneSearchEntries keeps the pane-level order.
const getAgentsDefaultSearchEntriesCatalog = createLocalizedCatalog((): SettingsSearchEntry[] => [
  {
    title: translate('auto.components.settings.agents.search.bb9ad95777', 'Agents'),
    description: translate(
      'auto.components.settings.agents.search.01926b9d8c',
      'Configure AI coding agents, default agent, and command overrides.'
    ),
    keywords: buildAgentSettingsKeywords()
  }
])

// Why: the runtime entry keeps its id (no SettingsSearchEntry annotation) so
// the includeAgentRuntime filter below can keep recognizing it.
const getAgentsRuntimeSearchEntriesCatalog = createLocalizedCatalog(() => [
  {
    title: translate('auto.components.settings.agents.search.agentRuntime', 'Agent Runtime'),
    id: AGENT_RUNTIME_SEARCH_ENTRY_ID,
    description: translate(
      'auto.components.settings.agents.search.agentRuntimeDescription',
      'Choose whether agents are detected and launched on Windows or in WSL by default.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.agents.search.96ba2373b6', 'agent'),
      ...translateSearchKeyword('auto.components.settings.agents.search.runtime', 'runtime'),
      ...translateSearchKeyword('auto.components.settings.agents.search.d2952dfd74', 'location'),
      ...translateSearchKeyword(
        'auto.components.settings.agents.search.agentLocation',
        'agent location'
      ),
      ...translateSearchKeyword('auto.components.settings.agents.search.77c02fa3c3', 'windows'),
      ...translateSearchKeyword('auto.components.settings.agents.search.d608654c03', 'wsl'),
      ...translateSearchKeyword('auto.components.settings.agents.search.f622b8eb2a', 'linux'),
      ...translateSearchKeyword('auto.components.settings.agents.search.839e82c81f', 'detect'),
      ...translateSearchKeyword('auto.components.settings.agents.search.2814401339', 'installed'),
      ...translateSearchKeyword(
        'auto.components.settings.agents.search.installedAgentsWsl',
        'installed agents in wsl'
      ),
      ...translateSearchKeyword('auto.components.settings.agents.search.719f53350c', 'path')
    ]
  }
])

const getAgentsStatusHooksSearchEntriesCatalog = createLocalizedCatalog(
  (): SettingsSearchEntry[] => [
    {
      title: getAgentStatusHooksTitle(),
      description: getAgentStatusHooksDescription(),
      keywords: getAgentStatusHooksSearchKeywords()
    }
  ]
)

const getAgentsGeneratedTabTitlesSearchEntriesCatalog = createLocalizedCatalog(
  (): SettingsSearchEntry[] => [
    {
      title: getAgentGeneratedTabTitlesTitle(),
      description: getAgentGeneratedTabTitlesDescription(),
      keywords: getAgentGeneratedTabTitlesSearchKeywords()
    }
  ]
)

const getAgentsAwakeSearchEntriesCatalog = createLocalizedCatalog((): SettingsSearchEntry[] => [
  {
    title: getAgentAwakeTitle(),
    description: getAgentAwakeDescription(),
    keywords: getAgentAwakeSearchKeywords()
  }
])

const getAgentsPermissionsSearchEntriesCatalog = createLocalizedCatalog(
  (): SettingsSearchEntry[] => [
    {
      title: translate(
        'auto.components.settings.agents.search.agentPermissions',
        'Agent Permissions'
      ),
      description: translate(
        'auto.components.settings.agents.search.agentPermissionsDescription',
        'Switch agent permission defaults between Yolo and Manual.'
      ),
      keywords: [
        ...translateSearchKeyword(
          'auto.components.settings.agents.search.permission',
          'permission'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.agents.search.permissions',
          'permissions'
        ),
        ...translateSearchKeyword('auto.components.settings.agents.search.yolo', 'yolo'),
        ...translateSearchKeyword('auto.components.settings.agents.search.manual', 'manual'),
        ...translateSearchKeyword('auto.components.settings.agents.search.skip', 'skip'),
        ...translateSearchKeyword('auto.components.settings.agents.search.checks', 'checks')
      ]
    }
  ]
)

const getAllAgentsPaneSearchEntries = createLocalizedCatalog(() => [
  ...getAgentsDefaultSearchEntriesCatalog(),
  ...getAgentsRuntimeSearchEntriesCatalog(),
  ...getAgentsStatusHooksSearchEntriesCatalog(),
  ...getAgentsGeneratedTabTitlesSearchEntriesCatalog(),
  ...getAgentsAwakeSearchEntriesCatalog(),
  ...getAgentsPermissionsSearchEntriesCatalog(),
  ...getAgentCacheTimerSearchEntries()
])

export function getAgentsDefaultSearchEntries(): SettingsSearchEntry[] {
  return getAgentsDefaultSearchEntriesCatalog()
}

export function getAgentsRuntimeSearchEntries() {
  return getAgentsRuntimeSearchEntriesCatalog()
}

export function getAgentsStatusHooksSearchEntries(): SettingsSearchEntry[] {
  return getAgentsStatusHooksSearchEntriesCatalog()
}

export function getAgentsGeneratedTabTitlesSearchEntries(): SettingsSearchEntry[] {
  return getAgentsGeneratedTabTitlesSearchEntriesCatalog()
}

export function getAgentsAwakeSearchEntries(): SettingsSearchEntry[] {
  return getAgentsAwakeSearchEntriesCatalog()
}

export function getAgentsPermissionsSearchEntries(): SettingsSearchEntry[] {
  return getAgentsPermissionsSearchEntriesCatalog()
}

export function getAgentsPaneSearchEntries({
  includeAgentRuntime = true
}: AgentsPaneSearchOptions = {}) {
  const entries = getAllAgentsPaneSearchEntries()
  if (includeAgentRuntime) {
    return entries
  }
  return entries.filter((entry) => !('id' in entry) || entry.id !== AGENT_RUNTIME_SEARCH_ENTRY_ID)
}
