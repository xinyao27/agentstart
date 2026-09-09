import type { HostBrowserTabProjection } from '~renderer/browser-tab-projection/types'
import { getExtensionBrowserCapabilities } from '~renderer/extension/browser-capabilities'
import { useAppStore } from '~renderer/store/state'

type BrowserCommandBinarySink = (
  receiptId: string,
  sequence: number,
  isEnd: boolean,
  payload: Uint8Array<ArrayBufferLike>,
  signal: AbortSignal
) => Promise<void>

const NAVIGATION_METHODS = new Set([
  'browser.back',
  'browser.forward',
  'browser.goto',
  'browser.reload'
])

export async function executeHostBrowserCommand(
  method: string,
  rawInput: unknown,
  authorityId: string | null = null,
  sendBinary?: BrowserCommandBinarySink,
  signal?: AbortSignal
): Promise<unknown> {
  const result = await getExtensionBrowserCapabilities().executeBrowserCommand(
    method,
    rawInput,
    authorityId,
    sendBinary && signal ? { sendBinary, signal } : undefined
  )
  await reconcileHostBrowserCommand(method, rawInput, result)
  return result
}

async function reconcileHostBrowserCommand(
  method: string,
  rawInput: unknown,
  result: unknown
): Promise<void> {
  const input = readRecord(rawInput)
  if (method === 'browser.tabList') {
    reconcileListedTabs(result)
    return
  }
  if (method === 'browser.tabCreate') {
    await projectCreatedTab(input, result)
    return
  }
  if (method === 'browser.tabClose') {
    const pageId = readString(input, 'page')
    if (pageId && readBoolean(result, 'closed')) {
      useAppStore.getState().removeHostBrowserTab(pageId)
    }
    return
  }
  if (NAVIGATION_METHODS.has(method)) {
    updateProjectedTab(readString(input, 'page'), result)
    return
  }
  if (method === 'browser.tabShow' || method === 'browser.tabCurrent') {
    projectDescribedTab(input, result)
    return
  }
  if (method === 'browser.tabSwitch') {
    const pageId = readString(result, 'browserPageId')
    if (pageId) {
      useAppStore.getState().setActiveBrowserTab(pageId)
    }
  }
}

function reconcileListedTabs(result: unknown): void {
  const rawTabs = Reflect.get(readRecord(result), 'tabs')
  if (!Array.isArray(rawTabs)) {
    return
  }
  const liveBrowserPageIds = new Set<string>()
  const state = useAppStore.getState()
  for (const rawTab of rawTabs) {
    const tab = readRecord(rawTab)
    const browserPageId = readString(tab, 'browserPageId')
    if (!browserPageId) {
      continue
    }
    liveBrowserPageIds.add(browserPageId)
    const worktreeId = readString(tab, 'worktreeId')
    if (!worktreeId) {
      continue
    }
    const url = readString(tab, 'url') ?? 'about:blank'
    state.upsertHostBrowserTab({
      browserPageId,
      worktreeId,
      url,
      title: readString(tab, 'title') ?? url,
      activate: readBoolean(tab, 'active')
    })
  }
  const freshState = useAppStore.getState()
  for (const pages of Object.values(freshState.browserPagesByWorkspace)) {
    for (const page of pages) {
      if (page.id.startsWith('chrome-tab:') && !liveBrowserPageIds.has(page.id)) {
        freshState.removeHostBrowserTab(page.id)
      }
    }
  }
}

async function projectCreatedTab(input: object, result: unknown): Promise<void> {
  const browserPageId = readString(result, 'browserPageId')
  const worktreeId = readWorktreeId(input)
  if (!browserPageId || !worktreeId) {
    return
  }
  let description: HostBrowserTabProjection = {
    browserPageId,
    worktreeId,
    url: readString(input, 'url') ?? 'about:blank',
    title: readString(input, 'url') ?? 'about:blank',
    activate: readBoolean(input, 'activate')
  }
  try {
    const shown = await getExtensionBrowserCapabilities().executeBrowserCommand('browser.tabShow', {
      page: browserPageId,
      worktree: `id:${worktreeId}`
    })
    description = readTabProjection(shown, worktreeId, description) ?? description
  } catch {
    // Why: creation already succeeded; a title lookup failure must not hide the
    // real Chrome tab from paired clients while its document is still loading.
  }
  useAppStore.getState().upsertHostBrowserTab(description)
}

function projectDescribedTab(input: object, result: unknown): void {
  const worktreeId = readWorktreeId(input)
  if (!worktreeId) {
    updateProjectedTab(readString(input, 'page'), Reflect.get(readRecord(result), 'tab'))
    return
  }
  const projection = readTabProjection(result, worktreeId)
  if (projection) {
    useAppStore.getState().upsertHostBrowserTab(projection)
  }
}

function readTabProjection(
  result: unknown,
  worktreeId: string,
  fallback?: HostBrowserTabProjection
): HostBrowserTabProjection | null {
  const tab = readRecord(Reflect.get(readRecord(result), 'tab'))
  const browserPageId = readString(tab, 'browserPageId') ?? fallback?.browserPageId
  if (!browserPageId) {
    return null
  }
  const url = readString(tab, 'url') ?? fallback?.url ?? 'about:blank'
  return {
    browserPageId,
    worktreeId,
    url,
    title: readString(tab, 'title') ?? fallback?.title ?? url,
    activate: readBoolean(tab, 'active') || fallback?.activate
  }
}

function updateProjectedTab(browserPageId: string | null, result: unknown): void {
  if (!browserPageId) {
    return
  }
  const state = useAppStore.getState()
  const url = readString(result, 'url')
  const title = readString(result, 'title')
  if (url) {
    state.setBrowserPageUrl(browserPageId, url)
  }
  if (title) {
    state.updateBrowserPageState(browserPageId, { title })
  }
}

function readWorktreeId(input: object): string | null {
  const selector = readString(input, 'worktree')
  return selector?.startsWith('id:') && selector.length > 3 ? selector.slice(3) : null
}

function readRecord(value: unknown): object {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
}

function readString(value: unknown, key: string): string | null {
  const candidate = Reflect.get(readRecord(value), key)
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
}

function readBoolean(value: unknown, key: string): boolean {
  return Reflect.get(readRecord(value), key) === true
}
