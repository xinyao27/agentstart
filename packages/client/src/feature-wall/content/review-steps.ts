import type { ReviewStepId } from '@agentstart/protocol/telemetry/feature-wall/types'
import { translate } from '~renderer/i18n/i18n'
import { createLocalizedCatalog } from '~renderer/i18n/localized-catalog'
// Per-step copy for the review tile in the Explore AgentStart modal. Mirrors
// agents-orchestration-steps.ts and workbench-steps.ts so the rail / body
// code can render all three the same way.

export type ReviewStep = {
  readonly id: ReviewStepId
  readonly name: string
  readonly subtitle: string
  readonly description: string
}

export const getReviewSteps = createLocalizedCatalog((): readonly ReviewStep[] => [
  {
    id: 'notes',
    name: translate('feature-wall.70440046a3', 'Notes'),
    subtitle: translate('feature-wall.880687b1da', 'Notes & diffs'),
    description: translate('feature-wall.69514c32e0', 'Send focused review notes to an agent.')
  },
  {
    id: 'pr-view',
    name: translate('feature-wall.8de869fd7d', 'PR checks'),
    subtitle: translate('feature-wall.45a73aece5', 'PR checks & comments'),
    description: translate('feature-wall.4ad3103d38', 'See PR status in Changes & Review.')
  },
  {
    id: 'ship',
    name: translate('feature-wall.0a3df4164f', 'Ship with AI'),
    subtitle: translate('feature-wall.0a3df4164f', 'Ship with AI'),
    description: translate(
      'feature-wall.b50a7bd9fb',
      'Let AI prepare commit and PR drafts for you.'
    )
  }
])
