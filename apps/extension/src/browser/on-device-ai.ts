import type { BrowserAiStatus } from '@agentstart/client/extension-bootstrap'

import { readEnterprisePolicy } from '../enterprise-policy'

const ENABLED_KEY = 'onDeviceAiEnabled'
const MAX_INPUT_CHARS = 12_000
const FALLBACK_CHARS = 240
const AI_AVAILABILITY_TIMEOUT_MS = 3_000
const AI_OPERATION_TIMEOUT_MS = 10_000

export async function readOnDeviceAiStatus(): Promise<BrowserAiStatus> {
  const [stored, availability] = await Promise.all([
    chrome.storage.sync.get(ENABLED_KEY),
    readSummarizerAvailability()
  ])
  return {
    availability,
    enabled:
      typeof stored === 'object' &&
      stored !== null &&
      Reflect.get(stored, ENABLED_KEY) === true &&
      !(await isManagedAiDisabled())
  }
}

export async function setOnDeviceAiEnabled(enabled: boolean): Promise<void> {
  if (enabled && (await isManagedAiDisabled())) {
    throw new Error('on_device_ai_disabled_by_policy')
  }
  await chrome.storage.sync.set({ [ENABLED_KEY]: enabled })
}

export async function summarizeText(
  input: string
): Promise<{ source: 'browser-ai' | 'fallback'; text: string }> {
  const text = normalizeText(input).slice(0, MAX_INPUT_CHARS)
  const fallback = deterministicSummary(text)
  const status = await readOnDeviceAiStatus()
  if (!status.enabled || status.availability === 'unavailable') {
    return { source: 'fallback', text: fallback }
  }
  let session: unknown = null
  try {
    const api = Reflect.get(globalThis, 'Summarizer')
    const create =
      api && (typeof api === 'object' || typeof api === 'function')
        ? Reflect.get(api, 'create')
        : null
    if (typeof create !== 'function') {
      return { source: 'fallback', text: fallback }
    }
    session = await settleWithin(
      Promise.resolve(
        Reflect.apply(create, api, [{ format: 'plain-text', length: 'short', type: 'key-points' }])
      ),
      null,
      AI_OPERATION_TIMEOUT_MS
    )
    if (typeof session !== 'object' || session === null) {
      return { source: 'fallback', text: fallback }
    }
    const summarize = Reflect.get(session, 'summarize')
    if (typeof summarize !== 'function') {
      return { source: 'fallback', text: fallback }
    }
    const result: unknown = await settleWithin(
      Promise.resolve(Reflect.apply(summarize, session, [text])),
      null,
      AI_OPERATION_TIMEOUT_MS
    )
    return typeof result === 'string' && result.trim()
      ? { source: 'browser-ai', text: normalizeText(result).slice(0, 500) }
      : { source: 'fallback', text: fallback }
  } catch {
    return { source: 'fallback', text: fallback }
  } finally {
    if (typeof session === 'object' && session !== null) {
      const destroy = Reflect.get(session, 'destroy')
      if (typeof destroy === 'function') {
        Reflect.apply(destroy, session, [])
      }
    }
  }
}

async function readSummarizerAvailability(): Promise<BrowserAiStatus['availability']> {
  try {
    const api = Reflect.get(globalThis, 'Summarizer')
    const availability =
      api && (typeof api === 'object' || typeof api === 'function')
        ? Reflect.get(api, 'availability')
        : null
    if (typeof availability !== 'function') {
      return 'unavailable'
    }
    const value: unknown = await settleWithin(
      Promise.resolve(Reflect.apply(availability, api, [])),
      'unavailable',
      AI_AVAILABILITY_TIMEOUT_MS
    )
    return value === 'available' || value === 'downloadable' || value === 'downloading'
      ? value
      : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

async function settleWithin<T>(operation: Promise<T>, fallback: T, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => resolve(fallback), timeoutMs)
      })
    ])
  } finally {
    clearTimeout(timeout)
  }
}

async function isManagedAiDisabled(): Promise<boolean> {
  return (await readEnterprisePolicy()).disableOnDeviceAi
}

function deterministicSummary(value: string): string {
  if (value.length <= FALLBACK_CHARS) {
    return value
  }
  const boundary = value.lastIndexOf(' ', FALLBACK_CHARS - 1)
  return `${value.slice(0, boundary > 80 ? boundary : FALLBACK_CHARS).trim()}…`
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
