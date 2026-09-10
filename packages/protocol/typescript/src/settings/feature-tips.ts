export type FeatureTipId = 'agentstart-cli' | 'command-palette'

export const FEATURE_TIP_IDS: readonly FeatureTipId[] = ['agentstart-cli', 'command-palette']

export function isFeatureTipId(value: unknown): value is FeatureTipId {
  return typeof value === 'string' && FEATURE_TIP_IDS.some((id) => id === value)
}

export function normalizeFeatureTipIds(value: unknown): FeatureTipId[] {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<FeatureTipId>()
  for (const item of value) {
    if (item === 'cmd-j-palette') {
      seen.add('command-palette')
      continue
    }
    if (isFeatureTipId(item)) {
      seen.add(item)
    }
  }
  return [...seen]
}
