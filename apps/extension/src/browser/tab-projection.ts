import type { BrowserTabProjectionEvent } from '@agentstart/client/extension-bootstrap'

const BROWSER_PAGE_PREFIX = 'chrome-tab:'
const TAB_WORKTREE_KEY_PREFIX = 'browserUseTabWorktree:'
type TabActiveInfo = Parameters<Parameters<typeof chrome.tabs.onActivated.addListener>[0]>[0]
type TabChangeInfo = Parameters<Parameters<typeof chrome.tabs.onUpdated.addListener>[0]>[1]

export function subscribeBrowserTabProjections(
  listener: (event: BrowserTabProjectionEvent) => void
): () => void {
  const publishChanged = (tab: chrome.tabs.Tab): void => {
    void buildChangedEvent(tab).then((event) => {
      if (event) {
        listener(event)
      }
    })
  }
  const onActivated = ({ tabId }: TabActiveInfo): void => {
    void chrome.tabs.get(tabId).then(publishChanged, () => {})
  }
  const onUpdated = (_tabId: number, change: TabChangeInfo, tab: chrome.tabs.Tab): void => {
    if (change.favIconUrl || change.status || change.title || change.url) {
      publishChanged(tab)
    }
  }
  const onRemoved = (tabId: number): void => {
    listener({ browserPageId: browserPageId(tabId), kind: 'removed' })
  }
  chrome.tabs.onActivated.addListener(onActivated)
  chrome.tabs.onUpdated.addListener(onUpdated)
  chrome.tabs.onRemoved.addListener(onRemoved)
  return () => {
    chrome.tabs.onActivated.removeListener(onActivated)
    chrome.tabs.onUpdated.removeListener(onUpdated)
    chrome.tabs.onRemoved.removeListener(onRemoved)
  }
}

async function buildChangedEvent(
  tab: chrome.tabs.Tab
): Promise<Extract<BrowserTabProjectionEvent, { kind: 'changed' }> | null> {
  if (tab.id === undefined || !isControllableTab(tab)) {
    return null
  }
  const key = `${TAB_WORKTREE_KEY_PREFIX}${tab.id}`
  const stored: unknown = await chrome.storage.session.get(key)
  const value = typeof stored === 'object' && stored !== null ? Reflect.get(stored, key) : null
  return {
    active: tab.active,
    browserPageId: browserPageId(tab.id),
    faviconUrl: tab.favIconUrl ?? null,
    kind: 'changed',
    loading: tab.status === 'loading',
    title: tab.title ?? tab.url ?? '',
    url: tab.url ?? tab.pendingUrl ?? '',
    worktreeId: typeof value === 'string' && value.length > 0 ? value : null
  }
}

function browserPageId(tabId: number): string {
  return `${BROWSER_PAGE_PREFIX}${tabId}`
}

function isControllableTab(tab: chrome.tabs.Tab): boolean {
  const rawUrl = tab.url ?? tab.pendingUrl
  if (!rawUrl) {
    return false
  }
  try {
    return (
      rawUrl === 'about:blank' || ['file:', 'http:', 'https:'].includes(new URL(rawUrl).protocol)
    )
  } catch {
    return false
  }
}
