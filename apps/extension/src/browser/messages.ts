import type { BrowserReplayCapture } from '@agentstart/client/extension-bootstrap'
import type { BrowserPerformanceCapture } from '@agentstart/client/extension-bootstrap'
import type {
  BrowserReplayEvent,
  WorkspaceConsoleSensorEntry as ConsoleSensorEntry
} from '@agentstart/protocol'

export async function sendActiveTabMessage(
  type: string,
  payload: Record<string, unknown> = {}
): Promise<unknown> {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  const tabId = tabs[0]?.id
  if (tabId === undefined) {
    throw new Error('active_tab_missing')
  }
  return chrome.runtime.sendMessage({ ...payload, tabId, type })
}

export function requireSuccessfulResponse(value: unknown): void {
  if (typeof value === 'object' && value !== null && Reflect.get(value, 'ok') === true) {
    return
  }
  const error =
    typeof value === 'object' && value !== null && typeof Reflect.get(value, 'error') === 'string'
      ? Reflect.get(value, 'error')
      : 'extension_browser_action_failed'
  throw new Error(error)
}

export function readBooleanResponse(value: unknown, field: string): boolean {
  requireSuccessfulResponse(value)
  return typeof value === 'object' && value !== null && Reflect.get(value, field) === true
}

export function readStringResponse(value: unknown, field: string): string {
  requireSuccessfulResponse(value)
  const result = typeof value === 'object' && value !== null ? Reflect.get(value, field) : null
  if (typeof result !== 'string') {
    throw new Error('extension_browser_response_invalid')
  }
  return result
}

export function parseConsoleEntries(value: unknown): ConsoleSensorEntry[] {
  requireSuccessfulResponse(value)
  const rawEntries =
    typeof value === 'object' && value !== null ? Reflect.get(value, 'entries') : null
  if (!Array.isArray(rawEntries)) {
    throw new Error('invalid_console_sensor_entries')
  }
  return rawEntries.map(parseConsoleEntry)
}

export function parseClaimedConsoleCaptures(value: unknown): {
  entries: ConsoleSensorEntry[]
  pageUrl: string
  projectId: string
  worktreeId: string
}[] {
  requireSuccessfulResponse(value)
  const captures =
    typeof value === 'object' && value !== null ? Reflect.get(value, 'captures') : null
  if (!Array.isArray(captures)) {
    throw new Error('claimed_console_captures_invalid')
  }
  return captures.map((capture) => {
    if (
      typeof capture !== 'object' ||
      capture === null ||
      !Array.isArray(Reflect.get(capture, 'entries')) ||
      typeof Reflect.get(capture, 'pageUrl') !== 'string' ||
      typeof Reflect.get(capture, 'projectId') !== 'string' ||
      typeof Reflect.get(capture, 'worktreeId') !== 'string'
    ) {
      throw new Error('claimed_console_capture_invalid')
    }
    return {
      entries: Reflect.get(capture, 'entries').map(parseConsoleEntry),
      pageUrl: Reflect.get(capture, 'pageUrl'),
      projectId: Reflect.get(capture, 'projectId'),
      worktreeId: Reflect.get(capture, 'worktreeId')
    }
  })
}

export function parseRecordingCapture(value: unknown): BrowserReplayCapture | null {
  requireSuccessfulResponse(value)
  const capture = typeof value === 'object' && value !== null ? Reflect.get(value, 'capture') : null
  if (capture === null) {
    return null
  }
  if (
    typeof capture !== 'object' ||
    typeof Reflect.get(capture, 'endedAt') !== 'number' ||
    !isBrowserReplayEvents(Reflect.get(capture, 'events')) ||
    typeof Reflect.get(capture, 'pageTitle') !== 'string' ||
    typeof Reflect.get(capture, 'pageUrl') !== 'string' ||
    typeof Reflect.get(capture, 'startedAt') !== 'number'
  ) {
    throw new Error('invalid_recording_capture')
  }
  return {
    endedAt: Reflect.get(capture, 'endedAt'),
    events: Reflect.get(capture, 'events'),
    pageTitle: Reflect.get(capture, 'pageTitle'),
    pageUrl: Reflect.get(capture, 'pageUrl'),
    startedAt: Reflect.get(capture, 'startedAt'),
    video: null
  }
}

export function parsePerformanceCapture(value: unknown): BrowserPerformanceCapture {
  requireSuccessfulResponse(value)
  const capture = typeof value === 'object' && value !== null ? Reflect.get(value, 'capture') : null
  if (
    typeof capture !== 'object' ||
    capture === null ||
    typeof Reflect.get(capture, 'data') !== 'string' ||
    typeof Reflect.get(capture, 'pageUrl') !== 'string'
  ) {
    throw new Error('performance_capture_invalid')
  }
  const rawMetrics = Reflect.get(capture, 'metrics')
  if (typeof rawMetrics !== 'object' || rawMetrics === null) {
    throw new Error('performance_capture_invalid')
  }
  return {
    data: new Blob([Reflect.get(capture, 'data')], { type: 'application/json' }),
    metrics: Object.fromEntries(
      Object.entries(rawMetrics).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number'
      )
    ),
    pageUrl: Reflect.get(capture, 'pageUrl')
  }
}

function parseConsoleEntry(rawEntry: unknown): ConsoleSensorEntry {
  if (typeof rawEntry !== 'object' || rawEntry === null) {
    throw new Error('invalid_console_sensor_entry')
  }
  const occurredAt = Reflect.get(rawEntry, 'occurredAt')
  const source = Reflect.get(rawEntry, 'source')
  const stack = Reflect.get(rawEntry, 'stack')
  const text = Reflect.get(rawEntry, 'text')
  if (
    typeof occurredAt !== 'number' ||
    (source !== 'console' && source !== 'exception' && source !== 'log') ||
    (stack !== undefined && typeof stack !== 'string') ||
    typeof text !== 'string'
  ) {
    throw new Error('invalid_console_sensor_entry')
  }
  return {
    occurredAt,
    source,
    ...(typeof stack === 'string' ? { stack } : {}),
    text
  }
}

function isBrowserReplayEvents(value: unknown): value is BrowserReplayEvent[] {
  return (
    Array.isArray(value) &&
    value.every(
      (event) =>
        typeof event === 'object' &&
        event !== null &&
        typeof Reflect.get(event, 'at') === 'number' &&
        ['click', 'input', 'keydown'].includes(String(Reflect.get(event, 'kind'))) &&
        typeof Reflect.get(event, 'selector') === 'string'
    )
  )
}
