import { parsePaneKey } from '@agentstart/protocol/terminal/pane-identity'
export type PromptCacheCountdownSelection = {
  startedAt: number
  ttlMs: number
}

export function getPromptCacheCountdownForPane(
  paneKey: string,
  cacheTimerByKey: Record<string, number | null>,
  ttlMs: number
): PromptCacheCountdownSelection | null {
  if (ttlMs <= 0 || parsePaneKey(paneKey) === null) {
    return null
  }
  const startedAt = cacheTimerByKey[paneKey]
  return startedAt == null ? null : { startedAt, ttlMs }
}
