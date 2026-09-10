import type { BrowserReplayEvent } from '@agentstart/protocol'

import { acquireAgentOverlay, releaseAgentOverlay } from '../agent-overlay'
import { acquireCdp, releaseCdp, sendCdp, subscribeCdp } from './session'

const BINDING_NAME = '__agentstartRecordBrowserEvent'
const MAX_RECORDING_EVENTS = 20_000

export type BrowserReplayCapture = {
  endedAt: number
  events: BrowserReplayEvent[]
  pageTitle: string
  pageUrl: string
  startedAt: number
}

type ActiveRecording = Omit<BrowserReplayCapture, 'endedAt'>

const recordings = new Map<number, ActiveRecording>()

export function isRecording(tabId: number): boolean {
  return recordings.has(tabId)
}

export function registerRecordingListeners(): void {
  subscribeCdp((tabId, method, params) => {
    if (method !== 'Runtime.bindingCalled' || Reflect.get(params, 'name') !== BINDING_NAME) {
      return
    }
    const payload = Reflect.get(params, 'payload')
    const recording = recordings.get(tabId)
    if (
      !recording ||
      typeof payload !== 'string' ||
      recording.events.length >= MAX_RECORDING_EVENTS
    ) {
      return
    }
    const event = parseReplayEvent(payload)
    if (event) {
      recording.events.push(event)
    }
  })
}

export async function startRecording(tabId: number): Promise<void> {
  if (recordings.has(tabId)) {
    return
  }
  const tab = await chrome.tabs.get(tabId)
  if (!tab.url || !isLocalPreviewUrl(tab.url)) {
    throw new Error('recording_requires_local_preview')
  }
  await acquireCdp(tabId, 'recorder')
  try {
    await acquireAgentOverlay(tabId, 'recorder')
    await sendCdp(tabId, 'Runtime.enable')
    await sendCdp(tabId, 'Page.enable')
    await sendCdp(tabId, 'Runtime.addBinding', { name: BINDING_NAME })
    await sendCdp(tabId, 'Page.addScriptToEvaluateOnNewDocument', {
      source: recordingScript()
    })
    await sendCdp(tabId, 'Runtime.evaluate', { expression: recordingScript() })
    recordings.set(tabId, {
      events: [],
      pageTitle: tab.title ?? '',
      pageUrl: tab.url,
      startedAt: Date.now()
    })
  } catch (error) {
    await releaseAgentOverlay(tabId, 'recorder')
    await releaseCdp(tabId, 'recorder')
    throw error
  }
}

export async function stopRecording(tabId: number): Promise<BrowserReplayCapture | null> {
  const recording = recordings.get(tabId)
  recordings.delete(tabId)
  await sendCdp(tabId, 'Runtime.evaluate', {
    expression: 'globalThis.__agentstartStopBrowserRecording?.()'
  }).catch(() => {})
  await releaseAgentOverlay(tabId, 'recorder')
  await releaseCdp(tabId, 'recorder')
  return recording ? { ...recording, endedAt: Date.now() } : null
}

export async function replayRecording(tabId: number, events: BrowserReplayEvent[]): Promise<void> {
  const tab = await chrome.tabs.get(tabId)
  if (!tab.url || !isLocalPreviewUrl(tab.url)) {
    throw new Error('replay_requires_local_preview')
  }
  await acquireCdp(tabId, 'recorder')
  try {
    await acquireAgentOverlay(tabId, 'recorder')
    let previousAt = events[0]?.at ?? 0
    for (const event of events) {
      await wait(Math.min(Math.max(event.at - previousAt, 0), 1_000))
      previousAt = event.at
      await sendCdp(tabId, 'Runtime.evaluate', {
        awaitPromise: true,
        expression: replayExpression(event)
      })
    }
  } finally {
    await releaseAgentOverlay(tabId, 'recorder')
    await releaseCdp(tabId, 'recorder')
  }
}

function parseReplayEvent(serialized: string): BrowserReplayEvent | null {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const at = Reflect.get(value, 'at')
  const kind = Reflect.get(value, 'kind')
  const selector = Reflect.get(value, 'selector')
  const key = Reflect.get(value, 'key')
  const eventValue = Reflect.get(value, 'value')
  if (
    typeof at !== 'number' ||
    (kind !== 'click' && kind !== 'input' && kind !== 'keydown') ||
    typeof selector !== 'string'
  ) {
    return null
  }
  return {
    at,
    kind,
    selector,
    ...(typeof key === 'string' ? { key } : {}),
    ...(typeof eventValue === 'string' ? { value: eventValue } : {})
  }
}

function isLocalPreviewUrl(rawUrl: string): boolean {
  const url = new URL(rawUrl)
  return (
    ['http:', 'https:'].includes(url.protocol) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())
  )
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function replayExpression(event: BrowserReplayEvent): string {
  return `(() => {
    const event = ${JSON.stringify(event)};
    const element = document.querySelector(event.selector);
    if (!(element instanceof HTMLElement)) throw new Error('recorded_element_missing');
    element.scrollIntoView({ block: 'center', inline: 'center' });
    if (event.kind === 'click') element.click();
    if (event.kind === 'input' && 'value' in element) {
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value');
      descriptor?.set?.call(element, event.value ?? '');
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (event.kind === 'keydown') {
      element.dispatchEvent(new KeyboardEvent('keydown', { key: event.key ?? '', bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { key: event.key ?? '', bubbles: true }));
    }
  })()`
}

function recordingScript(): string {
  return `(() => {
    if (globalThis.__agentstartStopBrowserRecording) return;
    const selector = (element) => {
      if (element.id) return '#' + CSS.escape(element.id);
      const parts = [];
      for (let current = element; current && current !== document.body; current = current.parentElement) {
        const siblings = current.parentElement
          ? Array.from(current.parentElement.children).filter((child) => child.tagName === current.tagName)
          : [];
        const suffix = siblings.length > 1 ? ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')' : '';
        parts.unshift(current.tagName.toLowerCase() + suffix);
      }
      return 'body > ' + parts.join(' > ');
    };
    const emit = (kind, target, extras = {}) => {
      if (!(target instanceof HTMLElement)) return;
      globalThis.${BINDING_NAME}(JSON.stringify({ at: Date.now(), kind, selector: selector(target), ...extras }));
    };
    const click = (event) => emit('click', event.target);
    const input = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
      if (target instanceof HTMLInputElement && target.type === 'password') return;
      emit('input', target, { value: target.value });
    };
    const keydown = (event) => {
      if (['Enter', 'Escape', 'Tab'].includes(event.key)) emit('keydown', event.target, { key: event.key });
    };
    document.addEventListener('click', click, true);
    document.addEventListener('change', input, true);
    document.addEventListener('keydown', keydown, true);
    globalThis.__agentstartStopBrowserRecording = () => {
      document.removeEventListener('click', click, true);
      document.removeEventListener('change', input, true);
      document.removeEventListener('keydown', keydown, true);
      delete globalThis.__agentstartStopBrowserRecording;
    };
  })()`
}
