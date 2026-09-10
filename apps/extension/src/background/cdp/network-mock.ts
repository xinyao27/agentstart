import { acquireAgentOverlay, releaseAgentOverlay } from '../agent-overlay'
import { acquireCdp, releaseCdp, sendCdp, subscribeCdp } from './session'

export type NetworkMockMode = 'empty' | 'error-500' | 'slow'

type NetworkMockRule = {
  mode: NetworkMockMode
  urlIncludes: string
}

const rules = new Map<number, NetworkMockRule>()

export function registerNetworkMockListeners(): void {
  subscribeCdp((tabId, method, params) => {
    if (method !== 'Fetch.requestPaused') {
      return
    }
    const rule = rules.get(tabId)
    const requestId = Reflect.get(params, 'requestId')
    const request = Reflect.get(params, 'request')
    const url =
      typeof request === 'object' && request !== null ? Reflect.get(request, 'url') : undefined
    if (!rule || typeof requestId !== 'string' || typeof url !== 'string') {
      return
    }
    void handlePausedRequest(tabId, requestId, url, rule)
  })

  chrome.tabs.onRemoved.addListener((tabId) => {
    if (rules.has(tabId)) {
      rules.delete(tabId)
      void releaseCdp(tabId, 'network-mock')
    }
  })
}

export function isNetworkMockActive(tabId: number): boolean {
  return rules.has(tabId)
}

export async function startNetworkMock(tabId: number, rule: NetworkMockRule): Promise<void> {
  const normalized = rule.urlIncludes.trim()
  if (!normalized || normalized.length > 2_048) {
    throw new Error('network_mock_pattern_invalid')
  }
  const tab = await chrome.tabs.get(tabId)
  if (!tab.url || !isLocalPreviewUrl(tab.url)) {
    throw new Error('network_mock_requires_local_preview')
  }
  const isNewRule = !rules.has(tabId)
  if (isNewRule) {
    await acquireCdp(tabId, 'network-mock')
    try {
      await sendCdp(tabId, 'Fetch.enable', { patterns: [{ requestStage: 'Request' }] })
    } catch (error) {
      await releaseCdp(tabId, 'network-mock')
      throw error
    }
  }
  try {
    rules.set(tabId, { ...rule, urlIncludes: normalized })
    await acquireAgentOverlay(tabId, 'network-mock')
  } catch (error) {
    if (isNewRule) {
      rules.delete(tabId)
      await sendCdp(tabId, 'Fetch.disable').catch(() => {})
      await releaseCdp(tabId, 'network-mock')
    }
    throw error
  }
}

export async function stopNetworkMock(tabId: number): Promise<void> {
  if (!rules.has(tabId)) {
    return
  }
  rules.delete(tabId)
  await releaseAgentOverlay(tabId, 'network-mock')
  await sendCdp(tabId, 'Fetch.disable').catch(() => {})
  await releaseCdp(tabId, 'network-mock')
}

async function handlePausedRequest(
  tabId: number,
  requestId: string,
  url: string,
  rule: NetworkMockRule
): Promise<void> {
  if (!url.includes(rule.urlIncludes)) {
    await sendCdp(tabId, 'Fetch.continueRequest', { requestId }).catch(() => {})
    return
  }
  if (rule.mode === 'slow') {
    await new Promise((resolve) => setTimeout(resolve, 2_000))
    await sendCdp(tabId, 'Fetch.continueRequest', { requestId }).catch(() => {})
    return
  }
  const body = rule.mode === 'empty' ? '[]' : '{"error":"Simulated by AgentStart"}'
  await sendCdp(tabId, 'Fetch.fulfillRequest', {
    body: btoa(body),
    responseCode: rule.mode === 'empty' ? 200 : 500,
    responseHeaders: [{ name: 'content-type', value: 'application/json; charset=utf-8' }],
    requestId
  }).catch(() => {})
}

function isLocalPreviewUrl(rawUrl: string): boolean {
  const url = new URL(rawUrl)
  return (
    ['http:', 'https:'].includes(url.protocol) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())
  )
}
