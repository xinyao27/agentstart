import type { AgentsStepId } from '@agentstart/protocol/telemetry/feature-wall/types'
import { translate } from '~renderer/i18n/i18n'
import { createLocalizedCatalog } from '~renderer/i18n/localized-catalog'
// Per-step copy for the agents-orchestration tile in the Explore AgentStart modal.

export type AgentsStep = {
  readonly id: AgentsStepId
  // Short label rendered in the bottom stepper.
  readonly name: string
  // Subtitle shown directly under the modal's main title — "you are looking
  // at this slice of the workflow".
  readonly subtitle: string
  // One-sentence summary rendered under the subtitle.
  readonly description: string
  // Whether the step is optional — surfaced as an "Optional" pill next to the
  // subtitle so users know they can skip the related setup.
  readonly optional?: boolean
}

export const getAgentsSteps = createLocalizedCatalog((): readonly AgentsStep[] => [
  {
    id: 'statuses',
    name: translate('feature-wall.7d9ff4f0de', 'Visibility'),
    subtitle: translate('feature-wall.5e568e3868', 'Agent Visibility'),
    description: translate(
      'feature-wall.4ea5c3af47',
      'Know which agents are working, waiting, live, or blocked.'
    )
  },
  {
    id: 'orchestration',
    name: translate('feature-wall.6926cb0e99', 'Orchestration'),
    subtitle: translate('feature-wall.6926cb0e99', 'Orchestration'),
    description: translate(
      'feature-wall.03d648492d',
      'Enable agents to manage and coordinate AgentStart workspaces to execute larger tasks.'
    )
  },
  {
    id: 'usage',
    name: translate('feature-wall.0bb18642b7', 'Usage'),
    subtitle: translate('feature-wall.0bb18642b7', 'Usage'),
    description: translate(
      'feature-wall.533597e2b3',
      'Watch your usage and rate limits across every connected account, so you know when to switch.'
    ),
    optional: true
  }
])
