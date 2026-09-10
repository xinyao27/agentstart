import type { TerminalPaneSplitSource } from '@agentstart/protocol/telemetry/education'
import { trackTerminalPaneSplit } from '~renderer/feature-tips/telemetry'
import { useAppStore } from '~renderer/store/state'

export type TerminalPaneSplitCompletion = {
  source: TerminalPaneSplitSource
  direction: 'vertical' | 'horizontal'
  telemetrySuppressed?: boolean
}

export function recordCreatedTerminalPaneSplit(
  createdPane: unknown,
  completion: TerminalPaneSplitCompletion
): boolean {
  if (!createdPane) {
    return false
  }
  useAppStore.getState().recordFeatureInteraction('terminal-pane-split')
  if (!completion.telemetrySuppressed) {
    trackTerminalPaneSplit({
      source: completion.source,
      direction: completion.direction
    })
  }
  return true
}
