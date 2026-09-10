import type { FeatureTipId } from '@agentstart/protocol/settings/feature-tips'
import type { FeatureInteractionId } from '@agentstart/protocol/telemetry/interactions/catalog'
import {
  hasFeatureInteraction,
  type FeatureInteractionState
} from '@agentstart/protocol/telemetry/interactions/state'
import { translate } from '~renderer/i18n/i18n'
import { createLocalizedCatalog } from '~renderer/i18n/localized-catalog'

type FeatureTipPriority = 'new' | 'unseen'

export type FeatureTipAction = 'setup-cli' | 'learn-command-palette'

export type FeatureTip = {
  id: FeatureTipId
  priority: FeatureTipPriority
  eyebrow: string
  title: string
  description: string
  action: FeatureTipAction
  ctaLabel: string
  /** Feature interactions that mean this tip is no longer useful to show. */
  completedByFeatureInteractions?: readonly FeatureInteractionId[]
}

export type CompletedFeatureTipState = {
  cliInstalled: boolean
  featureInteractions?: FeatureInteractionState
}

export const getFeatureTips = createLocalizedCatalog((): readonly FeatureTip[] => [
  {
    id: 'agentstart-cli',
    priority: 'new',
    eyebrow: translate('feature-tips.d19ceca501', 'Tip'),
    title: translate(
      'feature-tips.3fe1fc9a33',
      'Let agents drive AgentStart with the AgentStart CLI'
    ),
    description: translate(
      'feature-tips.8d67d7764a',
      'Enable agents to coordinate child worktrees and communicate between worktrees.'
    ),
    action: 'setup-cli',
    ctaLabel: translate('feature-tips.1b0f375850', 'Install CLI & Skills'),
    completedByFeatureInteractions: []
  },
  {
    id: 'command-palette',
    priority: 'new',
    eyebrow: translate('feature-tips.d19ceca501', 'Tip'),
    // Why: "<shortcut>" is a placeholder token; the command-palette dialog splits the
    // title on it and inlines the live, platform-correct keybinding as a <kbd>.
    title: translate('feature-tips.c3cab3c204', 'Open everything with <shortcut>'),
    description: translate(
      'feature-tips.0a8b4458e2',
      'Search projects and files, switch tabs, open settings, or launch an agent from one place.'
    ),
    action: 'learn-command-palette',
    ctaLabel: translate('feature-tips.5b8027fa0e', 'Got it'),
    completedByFeatureInteractions: []
  }
])

export function getCompletedFeatureTipIds(state: CompletedFeatureTipState): Set<FeatureTipId> {
  const completedIds = new Set<FeatureTipId>()
  if (state.cliInstalled) {
    completedIds.add('agentstart-cli')
  }
  for (const tip of getFeatureTips()) {
    if (
      tip.completedByFeatureInteractions?.some((id) =>
        hasFeatureInteraction(state.featureInteractions, id)
      )
    ) {
      completedIds.add(tip.id)
    }
  }
  return completedIds
}

export function getOrderedUnseenFeatureTips(args: {
  seenTipIds: ReadonlySet<FeatureTipId>
  completedTipIds?: ReadonlySet<FeatureTipId>
}): FeatureTip[] {
  const completedTipIds = args.completedTipIds ?? new Set<FeatureTipId>()
  const unseenTips = getFeatureTips().filter(
    (tip) => !args.seenTipIds.has(tip.id) && !completedTipIds.has(tip.id)
  )
  return [
    ...unseenTips.filter((tip) => tip.priority === 'new'),
    ...unseenTips.filter((tip) => tip.priority !== 'new')
  ]
}
