import {
  normalizeContextualTourIds,
  type ContextualTourId
} from '@yiru/protocol/settings/contextual-tours'
import type { PersistedUIState } from '@yiru/protocol/settings/ui-state'
import type { FeatureInteractionId } from '@yiru/protocol/telemetry/interactions/catalog'
import {
  normalizeFeatureInteractions,
  type FeatureInteractionState
} from '@yiru/protocol/telemetry/interactions/state'
import { getContextualTour } from '~renderer/contextual-tours/catalog'
import {
  hasContextualTourTarget,
  getNextVisibleContextualTourStepIndex
} from '~renderer/runtime/contextual-tour-gate'

import type { AppState } from '../../store/types'

export function mergeFeatureInteractionState(
  current: FeatureInteractionState,
  incoming: PersistedUIState['featureInteractions']
): FeatureInteractionState {
  const currentNormalized = normalizeFeatureInteractions(current)
  const incomingNormalized = normalizeFeatureInteractions(incoming)
  const merged: FeatureInteractionState = { ...currentNormalized }
  for (const [id, incomingRecord] of Object.entries(incomingNormalized)) {
    const featureId = id as FeatureInteractionId
    const currentRecord = currentNormalized[featureId]
    merged[featureId] = currentRecord
      ? {
          firstInteractedAt: Math.min(
            currentRecord.firstInteractedAt,
            incomingRecord.firstInteractedAt
          ),
          interactionCount: Math.max(
            currentRecord.interactionCount,
            incomingRecord.interactionCount
          )
        }
      : incomingRecord
  }
  return merged
}

export function mergeContextualTourSeenIds(
  current: readonly ContextualTourId[],
  incoming: PersistedUIState['contextualToursSeenIds']
): ContextualTourId[] {
  const merged = new Set<ContextualTourId>(normalizeContextualTourIds(current))
  for (const id of normalizeContextualTourIds(incoming)) {
    merged.add(id)
  }
  return [...merged]
}

export function getContextualTourProgressionForFeatureInteraction(
  state: AppState,
  id: FeatureInteractionId
): 'advance' | 'complete' | 'reveal-sidebar-and-advance' | null {
  if (!state.activeContextualTourId) {
    return null
  }
  const tour = getContextualTour(state.activeContextualTourId)
  const step = tour.steps[state.activeContextualTourStepIndex]
  if (step?.advanceOnFeatureInteraction !== id) {
    return null
  }
  const nextStepIndex = getNextVisibleContextualTourStepIndex({
    tour,
    currentStepIndex: state.activeContextualTourStepIndex,
    targetExists: hasContextualTourTarget
  })
  if (nextStepIndex !== null) {
    return 'advance'
  }
  if (
    state.activeContextualTourId === 'workspace-agent-sessions' &&
    state.activeContextualTourStepIndex === 0 &&
    id === 'terminal-pane-split' &&
    !state.sidebarOpen
  ) {
    return 'reveal-sidebar-and-advance'
  }
  return 'complete'
}
