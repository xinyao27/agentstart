import type {
  BrowserConsoleEntry,
  BrowserNetworkEntry
} from '@agentstart/protocol/browser-observation'

import { acquireCdp, releaseCdp, sendCdp, subscribeCdp } from '../cdp/session'
import { optionalNumber, readArray, readNumberValue, readStringValue } from './command-value'
import { readBrowserCommandInput, resolveBrowserTab } from './target'

type NetworkDraft = BrowserNetworkEntry & { requestId: string }

type CaptureState = {
  consoleEntries: BrowserConsoleEntry[]
  networkEntries: Map<string, NetworkDraft>
}

const MAX_CAPTURE_ENTRIES = 1_000
const captures = new Map<number, CaptureState>()

export function registerBrowserObservabilityListeners(): void {
  subscribeCdp((tabId, method, params) => {
    const capture = captures.get(tabId)
    if (!capture) {
      return
    }
    const consoleEntry = parseConsoleEntry(method, params)
    if (consoleEntry) {
      capture.consoleEntries.push(consoleEntry)
      trimEntries(capture.consoleEntries)
    }
    updateNetworkEntry(capture, method, params)
  })
  chrome.tabs.onRemoved.addListener((tabId) => {
    captures.delete(tabId)
    void releaseCdp(tabId, 'browser-capture')
  })
}

export async function executeBrowserObservability(
  method: string,
  rawInput: unknown
): Promise<unknown> {
  const input = readBrowserCommandInput(rawInput)
  const tab = await resolveBrowserTab(input)
  if (tab.id === undefined) {
    throw new Error('browser_tab_id_missing')
  }
  const tabId = tab.id
  switch (method) {
    case 'browser.capture.start':
      await startCapture(tabId)
      return { capturing: true }
    case 'browser.capture.stop':
      await stopCapture(tabId)
      return { stopped: true }
    case 'browser.console':
      await startCapture(tabId)
      return consoleResult(tabId, optionalNumber(input, 'limit'))
    case 'browser.network':
      await startCapture(tabId)
      return networkResult(tabId, optionalNumber(input, 'limit'))
  }
  throw new Error(`browser_observability_command_unsupported:${method}`)
}

async function startCapture(tabId: number): Promise<void> {
  if (captures.has(tabId)) {
    return
  }
  await acquireCdp(tabId, 'browser-capture')
  try {
    await Promise.all([
      sendCdp(tabId, 'Log.enable'),
      sendCdp(tabId, 'Network.enable'),
      sendCdp(tabId, 'Runtime.enable')
    ])
    captures.set(tabId, { consoleEntries: [], networkEntries: new Map() })
  } catch (error) {
    await releaseCdp(tabId, 'browser-capture')
    throw error
  }
}

async function stopCapture(tabId: number): Promise<void> {
  if (!captures.has(tabId)) {
    return
  }
  captures.delete(tabId)
  await Promise.all([
    sendCdp(tabId, 'Log.disable').catch(() => {}),
    sendCdp(tabId, 'Network.disable').catch(() => {}),
    sendCdp(tabId, 'Runtime.disable').catch(() => {})
  ])
  await releaseCdp(tabId, 'browser-capture')
}

function consoleResult(tabId: number, requestedLimit: number | null) {
  const entries = captures.get(tabId)?.consoleEntries ?? []
  const limit = normalizeLimit(requestedLimit)
  return { entries: entries.slice(-limit), truncated: entries.length > limit }
}

function networkResult(tabId: number, requestedLimit: number | null) {
  const entries = [...(captures.get(tabId)?.networkEntries.values() ?? [])]
  const limit = normalizeLimit(requestedLimit)
  return {
    entries: entries.slice(-limit).map(({ requestId: _requestId, ...entry }) => entry),
    truncated: entries.length > limit
  }
}

function parseConsoleEntry(
  method: string,
  params: Record<string, unknown>
): BrowserConsoleEntry | null {
  if (method === 'Runtime.consoleAPICalled') {
    const level = readStringValue(params, 'type') || 'log'
    const args = readArray(params, 'args')
    const stack = readStackLocation(params)
    return {
      level,
      text: args.map(readRemoteValue).join(' '),
      timestamp: normalizeTimestamp(readNumberValue(params, 'timestamp')),
      ...(stack.line === null ? {} : { line: stack.line }),
      ...(stack.url === null ? {} : { url: stack.url })
    }
  }
  if (method === 'Runtime.exceptionThrown') {
    const details = readObject(params, 'exceptionDetails')
    if (!details) {
      return null
    }
    const stack = readStackLocation(details)
    return {
      level: 'error',
      text: readRemoteValue(Reflect.get(details, 'exception')) || readStringValue(details, 'text'),
      timestamp: normalizeTimestamp(readNumberValue(params, 'timestamp')),
      ...(stack.line === null ? {} : { line: stack.line }),
      ...(stack.url === null ? {} : { url: stack.url })
    }
  }
  if (method !== 'Log.entryAdded') {
    return null
  }
  const entry = readObject(params, 'entry')
  return entry
    ? {
        level: readStringValue(entry, 'level'),
        line: readNumberValue(entry, 'lineNumber'),
        text: readStringValue(entry, 'text'),
        timestamp: normalizeTimestamp(readNumberValue(entry, 'timestamp')),
        url: readStringValue(entry, 'url')
      }
    : null
}

function updateNetworkEntry(
  capture: CaptureState,
  method: string,
  params: Record<string, unknown>
): void {
  const requestId = Reflect.get(params, 'requestId')
  if (typeof requestId !== 'string') {
    return
  }
  if (method === 'Network.requestWillBeSent') {
    const request = readObject(params, 'request')
    if (!request) {
      return
    }
    capture.networkEntries.set(requestId, {
      method: readStringValue(request, 'method'),
      mimeType: '',
      requestId,
      size: 0,
      status: 0,
      timestamp: normalizeTimestamp(readNumberValue(params, 'wallTime')),
      url: readStringValue(request, 'url')
    })
    trimNetworkEntries(capture.networkEntries)
    return
  }
  const current = capture.networkEntries.get(requestId)
  if (!current) {
    return
  }
  if (method === 'Network.responseReceived') {
    const response = readObject(params, 'response')
    if (response) {
      current.mimeType = readStringValue(response, 'mimeType')
      current.status = readNumberValue(response, 'status')
    }
  } else if (method === 'Network.loadingFinished') {
    current.size = readNumberValue(params, 'encodedDataLength')
  }
}

function readRemoteValue(value: unknown): string {
  if (typeof value !== 'object' || value === null) {
    return typeof value === 'string' ? value : ''
  }
  const direct = Reflect.get(value, 'value')
  if (typeof direct === 'string') {
    return direct
  }
  if (typeof direct === 'number' || typeof direct === 'boolean' || direct === null) {
    return String(direct)
  }
  return readStringValue(value, 'description')
}

function readStackLocation(value: object): { line: number | null; url: string | null } {
  const stack = readObject(value, 'stackTrace')
  const frames = stack ? readArray(stack, 'callFrames') : []
  const first = frames[0]
  return {
    line: first ? readNumberValue(first, 'lineNumber') : null,
    url: first ? readStringValue(first, 'url') || null : null
  }
}

function readObject(value: object, key: string): Record<string, unknown> | null {
  const nested = Reflect.get(value, key)
  return typeof nested === 'object' && nested !== null ? nested : null
}

function normalizeTimestamp(value: number): number {
  if (value <= 0) {
    return Date.now()
  }
  return value < 1_000_000_000_000 ? Math.round(value * 1_000) : Math.round(value)
}

function normalizeLimit(value: number | null): number {
  return value === null ? 100 : Math.max(1, Math.min(Math.floor(value), MAX_CAPTURE_ENTRIES))
}

function trimEntries<T>(entries: T[]): void {
  if (entries.length > MAX_CAPTURE_ENTRIES) {
    entries.splice(0, entries.length - MAX_CAPTURE_ENTRIES)
  }
}

function trimNetworkEntries(entries: Map<string, NetworkDraft>): void {
  while (entries.size > MAX_CAPTURE_ENTRIES) {
    const oldest = entries.keys().next().value
    if (typeof oldest !== 'string') {
      return
    }
    entries.delete(oldest)
  }
}
