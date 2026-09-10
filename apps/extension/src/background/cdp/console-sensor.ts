import type { WorkspaceConsoleSensorEntry as ConsoleSensorEntry } from '@agentstart/protocol'

import { acquireCdp, releaseCdp, sendCdp, subscribeCdp } from './session'

const MAX_CONSOLE_ENTRIES = 500
const MAX_CONSOLE_TEXT_CHARS = 16 * 1_024

type ConsoleSensorState = {
  entries: ConsoleSensorEntry[]
  pageUrl: string
}

const sensors = new Map<number, ConsoleSensorState>()

export function registerConsoleSensorListeners(): void {
  subscribeCdp((tabId, method, params) => {
    const sensor = sensors.get(tabId)
    if (!sensor) {
      return
    }
    const entry = readConsoleEntry(method, params)
    if (!entry) {
      return
    }
    sensor.entries.push(entry)
    if (sensor.entries.length > MAX_CONSOLE_ENTRIES) {
      sensor.entries.splice(0, sensor.entries.length - MAX_CONSOLE_ENTRIES)
    }
  })

  chrome.tabs.onRemoved.addListener((tabId) => {
    if (sensors.has(tabId)) {
      sensors.delete(tabId)
      void releaseCdp(tabId, 'console-sensor')
    }
  })
}

export function isConsoleSensorActive(tabId: number): boolean {
  return sensors.has(tabId)
}

export async function startConsoleSensor(tabId: number): Promise<void> {
  if (sensors.has(tabId)) {
    return
  }
  const tab = await chrome.tabs.get(tabId)
  if (!tab.url || !isLocalPreviewUrl(tab.url)) {
    throw new Error('console_sensor_requires_local_preview')
  }
  await acquireCdp(tabId, 'console-sensor')
  try {
    await sendCdp(tabId, 'Runtime.enable')
    await sendCdp(tabId, 'Log.enable')
    sensors.set(tabId, { entries: [], pageUrl: tab.url })
  } catch (error) {
    await releaseCdp(tabId, 'console-sensor')
    throw error
  }
}

export async function stopConsoleSensor(tabId: number): Promise<void> {
  sensors.delete(tabId)
  await releaseCdp(tabId, 'console-sensor')
}

export function drainConsoleSensor(tabId: number): ConsoleSensorEntry[] {
  const sensor = sensors.get(tabId)
  return sensor ? sensor.entries.splice(0, sensor.entries.length) : []
}

function readConsoleEntry(
  method: string,
  params: Record<string, unknown>
): ConsoleSensorEntry | null {
  if (method === 'Runtime.consoleAPICalled' && Reflect.get(params, 'type') === 'error') {
    const args = Reflect.get(params, 'args')
    const text = Array.isArray(args) ? args.map(readRemoteValue).filter(Boolean).join(' ') : ''
    return createEntry('console', text || 'console.error', readStack(params))
  }
  if (method === 'Runtime.exceptionThrown') {
    const details = Reflect.get(params, 'exceptionDetails')
    if (typeof details !== 'object' || details === null) {
      return null
    }
    const exception = Reflect.get(details, 'exception')
    const text =
      readRemoteValue(exception) ||
      (typeof Reflect.get(details, 'text') === 'string'
        ? Reflect.get(details, 'text')
        : 'Uncaught exception')
    return createEntry('exception', text, readStack(details))
  }
  if (method === 'Log.entryAdded') {
    const entry = Reflect.get(params, 'entry')
    if (
      typeof entry !== 'object' ||
      entry === null ||
      Reflect.get(entry, 'level') !== 'error' ||
      typeof Reflect.get(entry, 'text') !== 'string'
    ) {
      return null
    }
    return createEntry('log', Reflect.get(entry, 'text'), readStack(entry))
  }
  return null
}

function createEntry(
  source: ConsoleSensorEntry['source'],
  text: string,
  stack: string | null
): ConsoleSensorEntry {
  return {
    occurredAt: Date.now(),
    source,
    ...(stack ? { stack: stack.slice(0, MAX_CONSOLE_TEXT_CHARS) } : {}),
    text: text.slice(0, MAX_CONSOLE_TEXT_CHARS)
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
  const description = Reflect.get(value, 'description')
  return typeof description === 'string' ? description : ''
}

function readStack(value: object): string | null {
  const stack = Reflect.get(value, 'stackTrace')
  if (typeof stack !== 'object' || stack === null) {
    return null
  }
  try {
    return JSON.stringify(stack)
  } catch {
    return null
  }
}

function isLocalPreviewUrl(rawUrl: string): boolean {
  const url = new URL(rawUrl)
  return (
    ['http:', 'https:'].includes(url.protocol) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())
  )
}
