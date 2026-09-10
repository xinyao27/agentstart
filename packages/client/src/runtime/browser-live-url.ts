const liveBrowserUrlByTabId = new Map<string, string>()

export function getLiveBrowserUrl(browserTabId: string): string | null {
  return liveBrowserUrlByTabId.get(browserTabId) ?? null
}
