import type { FeatureInteractionState } from '@agentstart/protocol/telemetry/interactions/state'
import type { StateCreator } from 'zustand'
import { recordRuntimeUIFeatureInteraction, setRuntimeUIState } from '~renderer/runtime/ui-client'

import type { AppState } from '../../store/types'
import {
  mergeFeatureInteractionState,
  mergeContextualTourSeenIds,
  getContextualTourProgressionForFeatureInteraction
} from './feature-model'
import type { UISlice } from './slice'

export function createUIFeatureActions(
  set: Parameters<StateCreator<AppState, [], [], UISlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], UISlice>>[1]
): Pick<UISlice, 'markFeatureTipsSeen' | 'recordFeatureInteraction'> {
  return {
    markFeatureTipsSeen: (ids) =>
      set((s) => {
        if (ids.length === 0) {
          return s
        }
        const current = new Set(s.featureTipsSeenIds)
        let changed = false
        for (const id of ids) {
          if (!current.has(id)) {
            current.add(id)
            changed = true
          }
        }
        if (!changed) {
          return s
        }
        const next = [...current]
        setRuntimeUIState(get().settings, { featureTipsSeenIds: next }).catch(console.error)
        return { featureTipsSeenIds: next }
      }),
    recordFeatureInteraction: (id) => {
      let tourProgression: ReturnType<typeof getContextualTourProgressionForFeatureInteraction> =
        null
      let persistPromise = Promise.resolve()
      set((s) => {
        if (!s.persistedUIReady) {
          return s
        }
        tourProgression = getContextualTourProgressionForFeatureInteraction(s, id)
        const existing = s.featureInteractions[id]
        const next: FeatureInteractionState = {
          ...s.featureInteractions,
          [id]: {
            firstInteractedAt: existing?.firstInteractedAt ?? Date.now(),
            interactionCount: (existing?.interactionCount ?? 0) + 1
          }
        }
        if (typeof window !== 'undefined') {
          const persist = recordRuntimeUIFeatureInteraction(get().settings, id).then((ui) => {
            set((current) => ({
              featureInteractions: mergeFeatureInteractionState(
                current.featureInteractions,
                ui.featureInteractions
              ),
              contextualToursSeenIds: mergeContextualTourSeenIds(
                current.contextualToursSeenIds,
                ui.contextualToursSeenIds
              )
            }))
          })
          persistPromise = persist.catch(console.error)
        }
        if (tourProgression === 'reveal-sidebar-and-advance') {
          // Why: the split can be triggered by keyboard/menu paths while the
          // sidebar is closed, but the next tour target lives in the sidebar.
          return {
            featureInteractions: next,
            sidebarOpen: true,
            activeContextualTourStepIndex: s.activeContextualTourStepIndex + 1
          }
        }
        return { featureInteractions: next }
      })
      if (tourProgression === 'complete') {
        get().completeContextualTour()
      } else if (tourProgression === 'advance') {
        get().advanceContextualTour()
      }
      return persistPromise
    }
  }
}
