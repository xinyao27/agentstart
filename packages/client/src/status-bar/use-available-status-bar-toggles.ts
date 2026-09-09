import type { StatusBarItem } from '@yiru/protocol/settings/ui-state'
import { useAppStore } from '~renderer/store/state'

import { isStatusBarItemAvailable } from './agent-gating'

/** Subscribes to detected-agent state and returns the toggles filtered to
 *  those whose underlying CLI is installed (or pre-detection). */
export function useAvailableStatusBarToggles<T extends { id: StatusBarItem }>(
  toggles: readonly T[]
): T[] {
  const detectedAgentIds = useAppStore((s) => s.detectedAgentIds)
  return toggles.filter((t) => isStatusBarItemAvailable(t.id, detectedAgentIds))
}
