import type { BrowserContextPayload } from '@agentstart/client/extension-bootstrap'

import { readEnterprisePolicy } from '../enterprise-policy'
import { requestBrowserPermissions } from './permission'

const PAGE_TEXT_LIMIT = 16_000
const HISTORY_ENTRY_LIMIT = 40

export async function captureActivePageContext(
  grant: 'always-site' | 'once'
): Promise<BrowserContextPayload> {
  const policy = await readEnterprisePolicy()
  if (policy.disableBrowserContext) {
    throw new Error('browser_context_disabled_by_policy')
  }
  const tab = await activeTab()
  if (tab.id === undefined || !isReadablePageUrl(tab.url)) {
    throw new Error('page_context_tab_unavailable')
  }
  const origin = `${new URL(tab.url).origin}/*`
  if (
    grant === 'always-site' &&
    policy.allowedSiteOrigins.length > 0 &&
    !policy.allowedSiteOrigins.includes(new URL(tab.url).origin)
  ) {
    throw new Error('browser_context_origin_blocked_by_policy')
  }
  const granted = await requestBrowserPermissions(
    grant === 'always-site'
      ? { origins: [origin], permissions: ['scripting'] }
      : { permissions: ['activeTab', 'scripting'] }
  )
  if (!granted) {
    throw new Error('page_context_permission_denied')
  }
  const [capture] = await chrome.scripting.executeScript({
    func: readSanitizedPage,
    target: { tabId: tab.id }
  })
  const result = parsePageCapture(capture?.result)
  return {
    imageUrl: null,
    kind: 'active-tab',
    linkUrl: null,
    pageTitle: result.title,
    pageUrl: result.url,
    selectionText: result.selection,
    text: result.text
  }
}

export async function consumePendingPageContext(): Promise<BrowserContextPayload | null> {
  const stored: unknown = await chrome.storage.session.get('pendingPageContext')
  const pending =
    typeof stored === 'object' && stored !== null ? Reflect.get(stored, 'pendingPageContext') : null
  return parsePendingContext(pending)
}

export async function clearPendingPageContext(): Promise<void> {
  await chrome.storage.session.remove('pendingPageContext')
}

export async function readRecentHistoryContext(minutes: number): Promise<BrowserContextPayload> {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
    throw new Error('history_context_window_invalid')
  }
  const granted = await requestBrowserPermissions({ permissions: ['history'] })
  if (!granted) {
    throw new Error('history_context_permission_denied')
  }
  const entries = await chrome.history.search({
    endTime: Date.now(),
    maxResults: HISTORY_ENTRY_LIMIT,
    startTime: Date.now() - minutes * 60_000,
    text: ''
  })
  const lines = entries.flatMap((entry) =>
    entry.url && isReadablePageUrl(entry.url)
      ? [`${entry.title?.trim() || entry.url}\n${entry.url}`]
      : []
  )
  return {
    imageUrl: null,
    kind: 'history',
    linkUrl: null,
    pageTitle: `Recent browsing · ${minutes} minutes`,
    pageUrl: '',
    selectionText: null,
    text: lines.join('\n\n').slice(0, PAGE_TEXT_LIMIT)
  }
}

function readSanitizedPage(): {
  selection: string | null
  text: string
  title: string
  url: string
} {
  const clone = document.body.cloneNode(true)
  if (!(clone instanceof HTMLElement)) {
    return { selection: null, text: '', title: document.title, url: location.href }
  }
  for (const element of clone.querySelectorAll('script, style, noscript, svg, canvas')) {
    element.remove()
  }
  const selection = getSelection()?.toString().trim().slice(0, 4_000) || null
  const text = (clone.innerText || clone.textContent || '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 16_000)
  const adapterContext = document.documentElement.dataset.agentstartContext?.trim().slice(0, 4_000)
  return {
    selection,
    text: adapterContext
      ? `${text}\n\n[Community adapter context — untrusted]\n${adapterContext}`.slice(0, 16_000)
      : text,
    title: document.title.slice(0, 512),
    url: location.href
  }
}

function parsePageCapture(value: unknown): {
  selection: string | null
  text: string
  title: string
  url: string
} {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof Reflect.get(value, 'text') !== 'string' ||
    typeof Reflect.get(value, 'title') !== 'string' ||
    typeof Reflect.get(value, 'url') !== 'string'
  ) {
    throw new Error('page_context_capture_invalid')
  }
  const selection = Reflect.get(value, 'selection')
  return {
    selection: typeof selection === 'string' ? selection : null,
    text: Reflect.get(value, 'text'),
    title: Reflect.get(value, 'title'),
    url: Reflect.get(value, 'url')
  }
}

function parsePendingContext(value: unknown): BrowserContextPayload | null {
  if (value === undefined || value === null) {
    return null
  }
  if (typeof value !== 'object' || typeof Reflect.get(value, 'pageUrl') !== 'string') {
    throw new Error('pending_page_context_invalid')
  }
  const pageUrl = Reflect.get(value, 'pageUrl')
  const selection = nullableString(Reflect.get(value, 'selectionText'))
  const link = nullableString(Reflect.get(value, 'linkUrl'))
  const image = nullableString(Reflect.get(value, 'imageUrl'))
  return {
    imageUrl: image,
    kind: 'context-menu',
    linkUrl: link,
    pageTitle: pageUrl,
    pageUrl,
    selectionText: selection,
    text: [selection, link, image].filter((item): item is string => item !== null).join('\n')
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value.slice(0, PAGE_TEXT_LIMIT) : null
}

async function activeTab(): Promise<chrome.tabs.Tab> {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  if (!tabs[0]) {
    throw new Error('active_tab_missing')
  }
  return tabs[0]
}

function isReadablePageUrl(value: string | undefined): value is string {
  return Boolean(value && (value.startsWith('http://') || value.startsWith('https://')))
}
