import type { BrowserTab } from '@yiru/protocol/workspace/browser-session'

export function buildDuplicatedBrowserTabOptions(
  source: Pick<BrowserTab, 'title' | 'sessionProfileId' | 'sessionPartition'>
): {
  title: string
  sessionProfileId: string | null
  sessionPartition: string | null
} {
  return {
    title: source.title,
    sessionProfileId: source.sessionProfileId ?? null,
    sessionPartition: source.sessionPartition ?? null
  }
}
