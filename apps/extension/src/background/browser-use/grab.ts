import { acquireCdp, releaseCdp, sendCdp } from '../cdp/session'
import type {
  BrowserGrabAwaitInput,
  BrowserGrabCaptureInput,
  BrowserGrabSetModeInput,
  BrowserPageIdInput
} from './control-input'
import { buildGuestOverlayScript } from './grab-guest-script'
import {
  parseGrabAwaitInput,
  parseGrabCaptureInput,
  parseGrabSetModeInput,
  parsePageIdInput
} from './grab-input'
import { clampGrabPayload } from './grab-payload'
import { BrowserGrabSessionController } from './grab-session'
import { GRAB_BUDGET } from './grab/model'
import { authorizedRegistrationGeneration, registrationGeneration } from './page-registry'
import { parseBrowserPageId } from './target'

const grabSessions = new BrowserGrabSessionController()
const grabActivities = new Map<number, Set<Promise<unknown>>>()

export function registerBrowserGrabListeners(): void {
  chrome.tabs.onRemoved.addListener((tabId) => grabSessions.cancel(tabId, 'evicted'))
  chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === 'loading') {
      grabSessions.cancel(tabId, 'navigation')
    }
  })
}

export function executeBrowserGrab(
  method: string,
  input: object,
  authorityId: string | null
): Promise<unknown> {
  switch (method) {
    case 'browser.grab.setMode': {
      const parsed = parseGrabSetModeInput(input)
      return trackGrabActivity(
        parseBrowserPageId(parsed.browserPageId),
        setGrabMode(parsed, authorityId)
      )
    }
    case 'browser.grab.awaitSelection': {
      const parsed = parseGrabAwaitInput(input)
      return trackGrabActivity(
        parseBrowserPageId(parsed.browserPageId),
        awaitGrabSelection(parsed, authorityId)
      )
    }
    case 'browser.grab.cancel':
      return Promise.resolve(cancelGrab(parsePageIdInput(input), authorityId))
    case 'browser.grab.captureSelection': {
      const parsed = parseGrabCaptureInput(input)
      return trackGrabActivity(
        parseBrowserPageId(parsed.browserPageId),
        captureSelection(parsed, authorityId)
      )
    }
    case 'browser.grab.extractHover': {
      const parsed = parsePageIdInput(input)
      return trackGrabActivity(
        parseBrowserPageId(parsed.browserPageId),
        extractHover(parsed, authorityId)
      )
    }
    default:
      return Promise.reject(new Error(`browser_grab_unsupported:${method}`))
  }
}

export async function releaseBrowserGrab(tabId: number): Promise<void> {
  grabSessions.cancel(tabId, 'evicted')
  let activities = grabActivities.get(tabId)
  while (activities?.size) {
    await Promise.allSettled(activities)
    activities = grabActivities.get(tabId)
  }
  await evaluateOverlayUntracked(tabId, 'teardown')
}

export function discardBrowserGrab(tabId: number): void {
  grabSessions.cancel(tabId, 'evicted')
  grabActivities.delete(tabId)
  void releaseCdp(tabId, 'browser-grab')
}

async function setGrabMode(
  input: BrowserGrabSetModeInput,
  authorityId: string | null
): Promise<unknown> {
  const tabId = parseBrowserPageId(input.browserPageId)
  const generation = authorizedRegistrationGeneration(tabId, authorityId)
  if (!generation) {
    return { ok: false, reason: 'not-ready' }
  }
  if (!input.enabled) {
    grabSessions.cancel(tabId, 'user')
    await evaluateOverlay(tabId, 'teardown').catch(() => undefined)
    return isCurrentRegistration(tabId, generation)
      ? { ok: true }
      : { ok: false, reason: 'not-ready' }
  }
  try {
    assertCurrentRegistration(tabId, generation)
    await evaluateOverlay(tabId, 'arm')
    assertCurrentRegistration(tabId, generation)
    return { ok: true }
  } catch {
    await evaluateOverlayUntracked(tabId, 'teardown').catch(() => undefined)
    return { ok: false, reason: 'not-ready' }
  }
}

async function awaitGrabSelection(
  input: BrowserGrabAwaitInput,
  authorityId: string | null
): Promise<unknown> {
  const tabId = parseBrowserPageId(input.browserPageId)
  const generation = authorizedRegistrationGeneration(tabId, authorityId)
  if (!generation) {
    return { kind: 'error', opId: input.opId, reason: 'Guest not ready' }
  }
  const result = await grabSessions.awaitSelection(tabId, input.opId, async (action) => {
    if (action !== 'teardown') {
      assertCurrentRegistration(tabId, generation)
    }
    const value = await evaluateOverlay(tabId, action)
    if (action !== 'teardown') {
      assertCurrentRegistration(tabId, generation)
    }
    return value
  })
  if (!isCurrentRegistration(tabId, generation)) {
    await evaluateOverlayUntracked(tabId, 'teardown').catch(() => undefined)
    return { kind: 'error', opId: input.opId, reason: 'Guest not ready' }
  }
  return result
}

function cancelGrab(input: BrowserPageIdInput, authorityId: string | null): { accepted: boolean } {
  const tabId = parseBrowserPageId(input.browserPageId)
  if (!authorizedRegistrationGeneration(tabId, authorityId)) {
    return { accepted: false }
  }
  grabSessions.cancel(tabId, 'user')
  void evaluateOverlay(tabId, 'teardown').catch(() => undefined)
  return { accepted: true }
}

async function captureSelection(
  input: BrowserGrabCaptureInput,
  authorityId: string | null
): Promise<unknown> {
  const tabId = parseBrowserPageId(input.browserPageId)
  const generation = authorizedRegistrationGeneration(tabId, authorityId)
  if (!generation) {
    return { ok: false, reason: 'Guest not ready' }
  }
  if (
    !Number.isFinite(input.rect.x) ||
    !Number.isFinite(input.rect.y) ||
    !Number.isFinite(input.rect.width) ||
    !Number.isFinite(input.rect.height) ||
    input.rect.width <= 0 ||
    input.rect.height <= 0
  ) {
    return { ok: false, reason: 'Screenshot capture failed' }
  }
  try {
    await acquireCdp(tabId, 'browser-grab')
    assertCurrentRegistration(tabId, generation)
  } catch {
    return { ok: false, reason: 'Screenshot capture failed' }
  }
  try {
    await evaluateScriptAttached(tabId, HIDE_OVERLAYS_SCRIPT)
    assertCurrentRegistration(tabId, generation)
    const response = await sendCdp(tabId, 'Page.captureScreenshot', {
      captureBeyondViewport: false,
      clip: { ...input.rect, scale: 1 },
      format: 'png'
    })
    assertCurrentRegistration(tabId, generation)
    const data = readString(response, 'data')
    if (!data || base64Bytes(data) > GRAB_BUDGET.screenshotMaxBytes) {
      return { ok: false, reason: 'Screenshot capture failed' }
    }
    return {
      ok: true,
      screenshot: {
        dataUrl: `data:image/png;base64,${data}`,
        height: Math.round(input.rect.height),
        mimeType: 'image/png',
        width: Math.round(input.rect.width)
      }
    }
  } catch {
    return { ok: false, reason: 'Screenshot capture failed' }
  } finally {
    await evaluateScriptAttached(tabId, RESTORE_OVERLAYS_SCRIPT).catch(() => undefined)
    await releaseCdp(tabId, 'browser-grab')
  }
}

async function extractHover(
  input: BrowserPageIdInput,
  authorityId: string | null
): Promise<unknown> {
  const tabId = parseBrowserPageId(input.browserPageId)
  const generation = authorizedRegistrationGeneration(tabId, authorityId)
  if (!generation) {
    return { ok: false, reason: 'Guest not ready' }
  }
  const rawPayload = await evaluateOverlay(tabId, 'extractHover').catch(() => null)
  if (!isCurrentRegistration(tabId, generation)) {
    return { ok: false, reason: 'Guest not ready' }
  }
  const payload = clampGrabPayload(rawPayload)
  return payload ? { ok: true, payload } : { ok: false, reason: 'No element hovered' }
}

async function evaluateOverlay(
  tabId: number,
  action: Parameters<typeof buildGuestOverlayScript>[0]
): Promise<unknown> {
  return trackGrabActivity(tabId, evaluateOverlayUntracked(tabId, action))
}

async function evaluateOverlayUntracked(
  tabId: number,
  action: Parameters<typeof buildGuestOverlayScript>[0]
): Promise<unknown> {
  await acquireCdp(tabId, 'browser-grab')
  try {
    return await evaluateScriptAttached(tabId, buildGuestOverlayScript(action))
  } finally {
    await releaseCdp(tabId, 'browser-grab')
  }
}

function trackGrabActivity<T>(tabId: number, activity: Promise<T>): Promise<T> {
  let activities = grabActivities.get(tabId)
  if (!activities) {
    activities = new Set()
    grabActivities.set(tabId, activities)
  }
  activities.add(activity)
  const remove = (): void => {
    activities.delete(activity)
    if (activities.size === 0 && grabActivities.get(tabId) === activities) {
      grabActivities.delete(tabId)
    }
  }
  void activity.then(remove, remove)
  return activity
}

function isCurrentRegistration(tabId: number, generation: string): boolean {
  return registrationGeneration(tabId) === generation
}

function assertCurrentRegistration(tabId: number, generation: string): void {
  if (!isCurrentRegistration(tabId, generation)) {
    throw new Error('browser_page_registration_stale')
  }
}

async function evaluateScriptAttached(tabId: number, expression: string): Promise<unknown> {
  const response = await sendCdp(tabId, 'Runtime.evaluate', {
    awaitPromise: true,
    expression,
    returnByValue: true,
    userGesture: true
  })
  const exception = readValue(response, 'exceptionDetails')
  if (exception) {
    throw new Error(readString(exception, 'text') ?? 'Selection failed')
  }
  return readValue(readValue(response, 'result'), 'value')
}

function readValue(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined
}

function readString(value: unknown, key: string): string | null {
  const result = readValue(value, key)
  return typeof result === 'string' ? result : null
}

function base64Bytes(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return Math.floor((value.length * 3) / 4) - padding
}

const HIDE_OVERLAYS_SCRIPT = `(function(){
  var grab = window.__yiruGrab;
  if (grab && grab.host) grab.host.style.display = 'none';
  var element = document.querySelector('[data-yiru-browser-annotation-overlay]');
  if (element) {
    element.setAttribute('data-yiru-previous-display', element.style.display || '');
    element.style.display = 'none';
  }
})()`

const RESTORE_OVERLAYS_SCRIPT = `(function(){
  var grab = window.__yiruGrab;
  if (grab && grab.host) grab.host.style.display = '';
  var element = document.querySelector('[data-yiru-browser-annotation-overlay]');
  if (element) {
    element.style.display = element.getAttribute('data-yiru-previous-display') || '';
    element.removeAttribute('data-yiru-previous-display');
  }
})()`
