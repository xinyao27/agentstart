const BROWSER_PAGE_PREFIX = 'chrome-tab:'
const LAST_BROWSER_TAB_KEY = 'browserUseLastTabId'
const TAB_WORKTREE_KEY_PREFIX = 'browserUseTabWorktree:'

type TabUpdateChange = Parameters<Parameters<typeof chrome.tabs.onUpdated.addListener>[0]>[1]

export type BrowserCommandInput = Record<string, unknown>

export function registerBrowserUseTargetListeners(): void {
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    void chrome.tabs.get(tabId).then(rememberBrowserTab, () => {})
  })
  chrome.tabs.onRemoved.addListener((tabId) => {
    void forgetBrowserTabWorktree(tabId)
    void chrome.storage.session.get(LAST_BROWSER_TAB_KEY).then((stored: unknown) => {
      if (
        typeof stored === 'object' &&
        stored !== null &&
        Reflect.get(stored, LAST_BROWSER_TAB_KEY) === tabId
      ) {
        return chrome.storage.session.remove(LAST_BROWSER_TAB_KEY)
      }
    })
  })
}

export function readBrowserCommandInput(input: unknown): BrowserCommandInput {
  if (input === undefined) {
    return {}
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('browser_command_input_invalid')
  }
  return input as BrowserCommandInput
}

export function browserPageId(tabId: number): string {
  return `${BROWSER_PAGE_PREFIX}${tabId}`
}

export async function listBrowserTabs(): Promise<chrome.tabs.Tab[]> {
  return (await chrome.tabs.query({})).filter(isControllableBrowserTab)
}

export async function describeBrowserTab(
  tab: chrome.tabs.Tab,
  index: number
): Promise<{
  active: boolean
  browserPageId: string
  index: number
  profileId: string
  profileLabel: string
  title: string
  url: string
  worktreeId: string | null
}> {
  if (tab.id === undefined) {
    throw new Error('browser_tab_id_missing')
  }
  return {
    active: tab.active,
    browserPageId: browserPageId(tab.id),
    index,
    profileId: 'chrome-profile',
    profileLabel: 'Chrome profile',
    title: tab.title ?? tab.url ?? '',
    url: tab.url ?? '',
    worktreeId: await readBrowserTabWorktree(tab.id)
  }
}

export async function resolveBrowserTab(input: BrowserCommandInput): Promise<chrome.tabs.Tab> {
  const explicitPage = Reflect.get(input, 'page')
  if (typeof explicitPage === 'string' && explicitPage.length > 0) {
    const tabId = parseBrowserPageId(explicitPage)
    const tab = await chrome.tabs.get(tabId).catch(() => null)
    if (!tab || !isControllableBrowserTab(tab)) {
      throw new Error(`browser_tab_not_found:${explicitPage}`)
    }
    await rememberBrowserTab(tab)
    return tab
  }

  const active = (await chrome.tabs.query({ active: true, lastFocusedWindow: true })).find(
    isControllableBrowserTab
  )
  if (active) {
    await rememberBrowserTab(active)
    return active
  }

  const stored: unknown = await chrome.storage.session.get(LAST_BROWSER_TAB_KEY)
  const storedId =
    typeof stored === 'object' && stored !== null ? Reflect.get(stored, LAST_BROWSER_TAB_KEY) : null
  if (typeof storedId === 'number') {
    const remembered = await chrome.tabs.get(storedId).catch(() => null)
    if (remembered && isControllableBrowserTab(remembered)) {
      return remembered
    }
  }

  const tabs = await listBrowserTabs()
  const recent = tabs.toSorted(
    (left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0)
  )[0]
  if (!recent) {
    throw new Error('browser_no_tab')
  }
  await rememberBrowserTab(recent)
  return recent
}

export async function waitForTabComplete(
  tabId: number,
  timeoutMs = 30_000
): Promise<chrome.tabs.Tab> {
  const current = await chrome.tabs.get(tabId)
  if (current.status === 'complete') {
    return current
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated)
      reject(new Error('browser_navigation_timeout'))
    }, timeoutMs)
    const onUpdated = (updatedTabId: number, change: TabUpdateChange): void => {
      if (updatedTabId !== tabId || change.status !== 'complete') {
        return
      }
      clearTimeout(timeout)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      void chrome.tabs.get(tabId).then(resolve, reject)
    }
    chrome.tabs.onUpdated.addListener(onUpdated)
  })
}

export async function rememberBrowserTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id !== undefined && isControllableBrowserTab(tab)) {
    await chrome.storage.session.set({ [LAST_BROWSER_TAB_KEY]: tab.id })
  }
}

export async function rememberBrowserTabWorktree(tabId: number, worktreeId: string): Promise<void> {
  if (worktreeId) {
    await chrome.storage.session.set({ [tabWorktreeKey(tabId)]: worktreeId })
  }
}

export async function readBrowserTabWorktree(tabId: number): Promise<string | null> {
  const key = tabWorktreeKey(tabId)
  const stored: unknown = await chrome.storage.session.get(key)
  const value = typeof stored === 'object' && stored !== null ? Reflect.get(stored, key) : null
  return typeof value === 'string' && value.length > 0 ? value : null
}

export async function forgetBrowserTabWorktree(tabId: number): Promise<void> {
  await chrome.storage.session.remove(tabWorktreeKey(tabId))
}

export function parseBrowserPageId(value: string): number {
  const candidate = value.startsWith(BROWSER_PAGE_PREFIX)
    ? value.slice(BROWSER_PAGE_PREFIX.length)
    : value
  const tabId = Number(candidate)
  if (!Number.isInteger(tabId) || tabId < 0) {
    throw new Error(`browser_page_id_invalid:${value}`)
  }
  return tabId
}

export function isControllableBrowserTab(tab: chrome.tabs.Tab): boolean {
  const url = tab.url ?? tab.pendingUrl
  if (!url) {
    return false
  }
  try {
    return url === 'about:blank' || ['http:', 'https:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

function tabWorktreeKey(tabId: number): string {
  return `${TAB_WORKTREE_KEY_PREFIX}${tabId}`
}
