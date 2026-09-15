import { acquireCdp, releaseCdp, sendCdp } from '../cdp/session'
import { evaluateBrowserValue } from './cdp'
import {
  optionalNumber,
  optionalString,
  parseHeaders,
  readArray,
  readBooleanValue,
  readNumberValue,
  readStringValue,
  requiredNumber,
  requiredString
} from './command-value'

type DeviceMetrics = { deviceScaleFactor: number; height: number; mobile: boolean; width: number }

const DEVICE_METRICS: Record<string, DeviceMetrics> = {
  'iPad Mini': { deviceScaleFactor: 2, height: 1024, mobile: true, width: 768 },
  'iPhone 12': { deviceScaleFactor: 3, height: 844, mobile: true, width: 390 },
  'iPhone 14 Pro': { deviceScaleFactor: 3, height: 852, mobile: true, width: 393 },
  'Pixel 5': { deviceScaleFactor: 2.75, height: 851, mobile: true, width: 393 }
}

const environmentTabs = new Set<number>()

export function registerBrowserPageEnvironmentListeners(): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    environmentTabs.delete(tabId)
    void releaseCdp(tabId, 'browser-environment')
  })
}

export async function getCookies(
  tabId: number,
  tab: chrome.tabs.Tab,
  input: Record<string, unknown>
) {
  const url = optionalString(input, 'url') ?? tab.url
  const response = await withTemporaryCdp(tabId, () =>
    sendCdp(tabId, 'Network.getCookies', url ? { urls: [url] } : {})
  )
  const cookies = readArray(response, 'cookies').map((cookie) => ({
    domain: readStringValue(cookie, 'domain'),
    expires: readNumberValue(cookie, 'expires'),
    httpOnly: Reflect.get(cookie, 'httpOnly') === true,
    name: readStringValue(cookie, 'name'),
    path: readStringValue(cookie, 'path'),
    sameSite: readStringValue(cookie, 'sameSite'),
    secure: Reflect.get(cookie, 'secure') === true,
    value: readStringValue(cookie, 'value')
  }))
  return { cookies }
}

export async function setCookie(
  tabId: number,
  tab: chrome.tabs.Tab,
  input: Record<string, unknown>
) {
  const sameSite = optionalString(input, 'sameSite')
  const expires = optionalNumber(input, 'expires')
  const domain = optionalString(input, 'domain')
  const path = optionalString(input, 'path')
  const result = await withTemporaryCdp(tabId, () =>
    sendCdp(tabId, 'Network.setCookie', {
      ...(expires === null ? {} : { expires }),
      ...(domain ? { domain } : {}),
      ...(path ? { path } : {}),
      ...(sameSite ? { sameSite: normalizeSameSite(sameSite) } : {}),
      httpOnly: Reflect.get(input, 'httpOnly') === true,
      name: requiredString(input, 'name'),
      secure: Reflect.get(input, 'secure') === true,
      url: tab.url,
      value: requiredString(input, 'value', true)
    })
  )
  return { success: readBooleanValue(result, 'success') }
}

export async function deleteCookie(
  tabId: number,
  tab: chrome.tabs.Tab,
  input: Record<string, unknown>
) {
  const domain = optionalString(input, 'domain')
  await withTemporaryCdp(tabId, () =>
    sendCdp(tabId, 'Network.deleteCookies', {
      ...(domain ? { domain } : {}),
      name: requiredString(input, 'name'),
      url: optionalString(input, 'url') ?? tab.url
    })
  )
  return { deleted: true }
}

export async function setViewport(tabId: number, input: Record<string, unknown>) {
  await keepEnvironmentCdp(tabId)
  const width = optionalNumber(input, 'width')
  const height = optionalNumber(input, 'height')
  // Why: an absent size is the caller asking for the tab's own viewport back. The mobile pane's
  // Web/Mobile switch sends no size to undo the phone viewport it emulated, and a viewport can
  // only be replaced, never left half-applied.
  if (width === undefined || height === undefined) {
    await sendCdp(tabId, 'Emulation.clearDeviceMetricsOverride', undefined)
    // Why: the wire result always carries the applied metrics, and a cleared override has none.
    // Zero reports "no emulated viewport" without inventing a size the tab does not have.
    return { deviceScaleFactor: 0, height: 0, mobile: false, width: 0 }
  }
  const metrics = {
    deviceScaleFactor: optionalNumber(input, 'deviceScaleFactor') ?? 1,
    height,
    mobile: Reflect.get(input, 'mobile') === true,
    width
  }
  await sendCdp(tabId, 'Emulation.setDeviceMetricsOverride', metrics)
  return metrics
}

export async function setGeolocation(tabId: number, input: Record<string, unknown>) {
  const value = {
    accuracy: optionalNumber(input, 'accuracy') ?? 1,
    latitude: requiredNumber(input, 'latitude'),
    longitude: requiredNumber(input, 'longitude')
  }
  await keepEnvironmentCdp(tabId)
  await sendCdp(tabId, 'Emulation.setGeolocationOverride', value)
  return value
}

export async function setDevice(tabId: number, input: Record<string, unknown>) {
  const name = requiredString(input, 'name')
  const metrics = DEVICE_METRICS[name]
  if (!metrics) {
    throw new Error(`browser_device_unsupported:${name}`)
  }
  await keepEnvironmentCdp(tabId)
  await sendCdp(tabId, 'Emulation.setDeviceMetricsOverride', metrics)
  return { ...metrics, name }
}

export async function setOffline(tabId: number, input: Record<string, unknown>) {
  const offline = optionalString(input, 'state') !== 'off'
  await keepEnvironmentCdp(tabId)
  await sendCdp(tabId, 'Network.enable')
  await sendCdp(tabId, 'Network.emulateNetworkConditions', {
    downloadThroughput: offline ? 0 : -1,
    latency: 0,
    offline,
    uploadThroughput: offline ? 0 : -1
  })
  return { offline }
}

export async function setHeaders(tabId: number, input: Record<string, unknown>) {
  const headers = parseHeaders(requiredString(input, 'headers'))
  await keepEnvironmentCdp(tabId)
  await sendCdp(tabId, 'Network.enable')
  await sendCdp(tabId, 'Network.setExtraHTTPHeaders', { headers })
  return { headers }
}

export async function setMedia(tabId: number, input: Record<string, unknown>) {
  const colorScheme = optionalString(input, 'colorScheme')
  const reducedMotion = optionalString(input, 'reducedMotion')
  const features = [
    colorScheme ? { name: 'prefers-color-scheme', value: colorScheme } : null,
    reducedMotion ? { name: 'prefers-reduced-motion', value: reducedMotion } : null
  ].filter((value) => value !== null)
  await keepEnvironmentCdp(tabId)
  await sendCdp(tabId, 'Emulation.setEmulatedMedia', { features })
  return { features }
}

export async function readClipboard(tabId: number) {
  const text = await evaluateBrowserValue(tabId, 'navigator.clipboard.readText()')
  return { text: typeof text === 'string' ? text : '' }
}

export async function writeClipboard(tabId: number, input: Record<string, unknown>) {
  const text = requiredString(input, 'text')
  await evaluateBrowserValue(tabId, `navigator.clipboard.writeText(${JSON.stringify(text)})`)
  return { written: true }
}

export async function handleDialog(tabId: number, accept: boolean, promptText: string | null) {
  await withTemporaryCdp(tabId, () =>
    sendCdp(tabId, 'Page.handleJavaScriptDialog', {
      accept,
      ...(promptText === null ? {} : { promptText })
    })
  )
  return { accepted: accept }
}

export async function getStorage(tabId: number, storage: string, key: string) {
  const value = await evaluateBrowserValue(tabId, `${storage}.getItem(${JSON.stringify(key)})`)
  return { key, value: typeof value === 'string' ? value : null }
}

export async function setStorage(tabId: number, storage: string, input: Record<string, unknown>) {
  const key = requiredString(input, 'key')
  const value = requiredString(input, 'value', true)
  await evaluateBrowserValue(
    tabId,
    `${storage}.setItem(${JSON.stringify(key)},${JSON.stringify(value)})`
  )
  return { key, value }
}

export async function clearStorage(tabId: number, storage: string) {
  await evaluateBrowserValue(tabId, `${storage}.clear()`)
  return { cleared: true }
}

async function keepEnvironmentCdp(tabId: number): Promise<void> {
  if (environmentTabs.has(tabId)) {
    return
  }
  await acquireCdp(tabId, 'browser-environment')
  environmentTabs.add(tabId)
}

async function withTemporaryCdp<T>(tabId: number, operation: () => Promise<T>): Promise<T> {
  await acquireCdp(tabId, 'browser-use')
  try {
    return await operation()
  } finally {
    await releaseCdp(tabId, 'browser-use')
  }
}

function normalizeSameSite(value: string): 'Lax' | 'None' | 'Strict' {
  const normalized = value.toLowerCase()
  if (normalized === 'strict') {
    return 'Strict'
  }
  if (normalized === 'none') {
    return 'None'
  }
  return 'Lax'
}
