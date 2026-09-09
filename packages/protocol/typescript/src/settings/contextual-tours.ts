export type ContextualTourId = 'workspace-agent-sessions' | 'browser' | 'workspace-creation'

export const CONTEXTUAL_TOUR_IDS: readonly ContextualTourId[] = [
  'workspace-agent-sessions',
  'browser',
  'workspace-creation'
]

export function isContextualTourId(value: unknown): value is ContextualTourId {
  return typeof value === 'string' && CONTEXTUAL_TOUR_IDS.some((id) => id === value)
}

export function normalizeContextualTourIds(value: unknown): ContextualTourId[] {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<ContextualTourId>()
  for (const item of value) {
    if (isContextualTourId(item)) {
      seen.add(item)
    }
  }
  return [...seen]
}
