import { translate } from '~renderer/i18n/i18n'
import { createLocalizedCatalog } from '~renderer/i18n/localized-catalog'

import type { SettingsSearchEntry } from './search'
import { translateSearchKeyword } from './search-keywords'

export const getExperimentalPaneSearchEntries = createLocalizedCatalog(
  (): SettingsSearchEntry[] => [
    {
      title: translate(
        'auto.components.settings.experimental.search.9e4ddf776d',
        'Terminal attention'
      ),
      description: translate(
        'auto.components.settings.experimental.search.11877246fc',
        'Persistent pane highlight for terminal bell and agent-completion events.'
      ),
      keywords: [
        ...translateSearchKeyword(
          'auto.components.settings.experimental.search.0d24759f14',
          'experimental'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.experimental.search.9bb3bd5098',
          'terminal'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.experimental.search.01567f19ca',
          'attention'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.experimental.search.268e99d957',
          'highlight'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.experimental.search.edc49480a1',
          'pane'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.experimental.search.8facf10138',
          'bell'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.experimental.search.7695fd30e9',
          'notification'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.experimental.search.5f067ba0f9',
          'agent'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.experimental.search.f10d307468',
          'completion'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.experimental.search.7b79081695',
          'unread'
        )
      ]
    },
    {
      title: translate(
        'auto.components.settings.experimental.search.agentHibernation.title',
        'Agent sleep'
      ),
      description: translate(
        'auto.components.settings.experimental.search.agentHibernation.description',
        'Stops idle background agent terminals after the configured idle window and resumes supported sessions when opened again. Agent sleep preserves launch options for agents started by AgentStart; manually started agents may resume with current AgentStart defaults.'
      ),
      keywords: [
        ...translateSearchKeyword(
          'auto.components.settings.experimental.search.0d24759f14',
          'experimental'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.experimental.search.agentHibernation.agent',
          'agent'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.experimental.search.agentHibernation.agents',
          'agents'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.experimental.search.agentHibernation.sleep',
          'sleep'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.experimental.search.agentHibernation.minutes',
          'minutes'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.experimental.search.agentHibernation.terminal',
          'terminal'
        )
      ]
    }
  ]
)

// Why: title-keyed lookup avoids a fragile numeric-index invariant — the array
// shape can change without breaking consumers, and a typo/rename throws loudly
// instead of silently matching the wrong (or empty) entry.
function findEntry(title: string): SettingsSearchEntry {
  const entry = getExperimentalPaneSearchEntries().find((e) => e.title === title)
  if (!entry) {
    throw new Error(`Missing experimental-pane search entry: "${title}"`)
  }
  return entry
}

export function getExperimentalSearchEntry() {
  return {
    terminalAttention: findEntry(
      translate('auto.components.settings.experimental.search.9e4ddf776d', 'Terminal attention')
    ),
    agentHibernation: findEntry(
      translate(
        'auto.components.settings.experimental.search.agentHibernation.title',
        'Agent sleep'
      )
    )
  } as const
}
