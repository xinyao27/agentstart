import type { WorkbenchStepId } from '@agentstart/protocol/telemetry/feature-wall/types'
import { translate } from '~renderer/i18n/i18n'
import { createLocalizedCatalog } from '~renderer/i18n/localized-catalog'
// Per-step copy for the workbench tile in the Explore AgentStart modal. Mirrors
// agents-orchestration-steps.ts so the rail / body code can render both the
// same way.

export type WorkbenchStep = {
  readonly id: WorkbenchStepId
  // Short label rendered in the rail.
  readonly name: string
  // Subtitle shown directly under the modal's main title.
  readonly subtitle: string
  // One-sentence summary rendered under the subtitle.
  readonly description: string
}

export const getWorkbenchSteps = createLocalizedCatalog((): readonly WorkbenchStep[] => [
  {
    id: 'terminal',
    name: translate('feature-wall.a1f52cdcb3', 'Terminal'),
    subtitle: translate('feature-wall.a1f52cdcb3', 'Terminal'),
    description: translate(
      'feature-wall.e4457b5784',
      'Keep your agents, tests, and dev logs visible at once.'
    )
  },
  {
    id: 'editor',
    name: translate('feature-wall.c7e9fb2ea6', 'Editor'),
    subtitle: translate('feature-wall.c7e9fb2ea6', 'Editor'),
    description: translate(
      'feature-wall.70930331cf',
      'Use our Notion-style markdown editor to write notes without leaving AgentStart.'
    )
  },
  {
    id: 'browser',
    name: translate('feature-wall.54a2cf5e63', 'Browser'),
    subtitle: translate('feature-wall.54a2cf5e63', 'Browser'),
    description: translate(
      'feature-wall.9bf3317c89',
      "Run your app in AgentStart's browser, send selected UI elements to agents, and let your agents interact with your webpage."
    )
  }
])
