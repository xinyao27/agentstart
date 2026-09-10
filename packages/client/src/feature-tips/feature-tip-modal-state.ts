import { isFeatureTipId, type FeatureTipId } from '@agentstart/protocol/settings/feature-tips'
import type { FeatureInteractionState } from '@agentstart/protocol/telemetry/interactions/state'

import {
  getFeatureTips,
  getCompletedFeatureTipIds,
  getOrderedUnseenFeatureTips,
  type FeatureTip
} from './catalog'

export function getFeatureTipForModal(args: {
  cliInstalled: boolean
  modalData: Record<string, unknown>
  seenTipIds: readonly FeatureTipId[]
  featureInteractions: FeatureInteractionState
}): FeatureTip | null {
  const modalTipId = isFeatureTipId(args.modalData.tipId) ? args.modalData.tipId : null
  if (modalTipId) {
    return getFeatureTips().find((tip) => tip.id === modalTipId) ?? null
  }

  const pendingTips = getOrderedUnseenFeatureTips({
    seenTipIds: new Set(args.seenTipIds),
    completedTipIds: getCompletedFeatureTipIds({
      cliInstalled: args.cliInstalled,
      featureInteractions: args.featureInteractions
    })
  })

  return pendingTips[0] ?? null
}
