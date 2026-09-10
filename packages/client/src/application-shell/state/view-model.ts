import type { TopLevelView } from '@agentstart/protocol/settings/ui-state'

import { KNOWN_TOP_LEVEL_VIEWS } from './persistence-model'

function isTopLevelView(value: unknown): value is TopLevelView {
  return typeof value === 'string' && KNOWN_TOP_LEVEL_VIEWS.has(value)
}

export function sanitizeHydratedActiveView(value: unknown): TopLevelView {
  // Why: older data (pre-activeView) or a view a different build doesn't have
  // should land on the durable overview instead of rendering nothing.
  if (!isTopLevelView(value)) {
    return 'home'
  }
  return value
}

let agentSendTargetModeInstanceCounter = 0

export function createAgentSendTargetModeInstanceId(): string {
  agentSendTargetModeInstanceCounter += 1
  return `${Date.now()}:${agentSendTargetModeInstanceCounter}`
}
