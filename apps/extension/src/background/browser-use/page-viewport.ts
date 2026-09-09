import { acquireCdp, releaseCdp, sendCdp } from '../cdp/session'
import type { BrowserViewportOverrideInput } from './control-input'

const viewportOperations = new Map<number, Promise<boolean>>()
const viewportSessions = new Set<number>()
const viewportEpochs = new Map<number, number>()

export async function setPageViewport(
  tabId: number,
  override: BrowserViewportOverrideInput['override'],
  isCurrent: () => boolean
): Promise<{ accepted: boolean }> {
  const epoch = viewportEpoch(tabId)
  const previous = viewportOperations.get(tabId) ?? Promise.resolve(true)
  const operation = previous
    .catch(() => false)
    .then(() => applyViewport(tabId, override, isCurrent, epoch))
  viewportOperations.set(tabId, operation)
  try {
    return { accepted: await operation }
  } finally {
    if (viewportOperations.get(tabId) === operation) {
      viewportOperations.delete(tabId)
    }
  }
}

export async function discardPageViewport(tabId: number): Promise<void> {
  viewportEpochs.set(tabId, viewportEpoch(tabId) + 1)
  viewportOperations.delete(tabId)
  viewportSessions.delete(tabId)
  await releaseCdp(tabId, 'browser-viewport')
}

export async function releasePageViewport(tabId: number): Promise<void> {
  const previous = viewportOperations.get(tabId) ?? Promise.resolve(true)
  const operation = previous
    .catch(() => false)
    .then(async () => {
      if (!viewportSessions.has(tabId)) {
        return true
      }
      await clearViewport(tabId)
      viewportSessions.delete(tabId)
      await releaseCdp(tabId, 'browser-viewport')
      return true
    })
  viewportOperations.set(tabId, operation)
  try {
    await operation
  } finally {
    if (viewportOperations.get(tabId) === operation) {
      viewportOperations.delete(tabId)
    }
  }
}

async function applyViewport(
  tabId: number,
  override: BrowserViewportOverrideInput['override'],
  isCurrent: () => boolean,
  epoch: number
): Promise<boolean> {
  try {
    if (!isCurrent() || viewportEpoch(tabId) !== epoch) {
      return false
    }
    if (!viewportSessions.has(tabId)) {
      await acquireCdp(tabId, 'browser-viewport')
      viewportSessions.add(tabId)
    }
    assertCurrent(tabId, isCurrent, epoch)
    if (override) {
      await sendCdp(tabId, 'Emulation.setDeviceMetricsOverride', override)
      assertCurrent(tabId, isCurrent, epoch)
      await sendCdp(tabId, 'Emulation.setTouchEmulationEnabled', {
        enabled: override.mobile,
        ...(override.mobile ? { maxTouchPoints: 5 } : {})
      })
      assertCurrent(tabId, isCurrent, epoch)
      await setViewportUserAgent(tabId, override.mobile)
      assertCurrent(tabId, isCurrent, epoch)
    } else {
      await clearViewport(tabId)
      assertCurrent(tabId, isCurrent, epoch)
      viewportSessions.delete(tabId)
      await releaseCdp(tabId, 'browser-viewport')
    }
    return true
  } catch {
    if (viewportEpoch(tabId) !== epoch) {
      viewportSessions.delete(tabId)
      await releaseCdp(tabId, 'browser-viewport')
    } else if (viewportSessions.has(tabId) && (await rollbackViewport(tabId))) {
      viewportSessions.delete(tabId)
      await releaseCdp(tabId, 'browser-viewport')
    }
    return false
  }
}

async function rollbackViewport(tabId: number): Promise<boolean> {
  try {
    await clearViewport(tabId)
    return true
  } catch {
    return false
  }
}

function assertCurrent(tabId: number, isCurrent: () => boolean, epoch: number): void {
  if (!isCurrent() || viewportEpoch(tabId) !== epoch) {
    throw new Error('browser_page_registration_stale')
  }
}

function viewportEpoch(tabId: number): number {
  return viewportEpochs.get(tabId) ?? 0
}

async function clearViewport(tabId: number): Promise<void> {
  const commands: readonly (readonly [string, Record<string, unknown> | undefined])[] = [
    ['Emulation.clearDeviceMetricsOverride', undefined],
    ['Emulation.setTouchEmulationEnabled', { enabled: false }],
    ['Emulation.setUserAgentOverride', { userAgent: '' }]
  ]
  let failure: unknown = null
  for (const [method, params] of commands) {
    try {
      await sendCdp(tabId, method, params)
    } catch (error) {
      failure ??= error
    }
  }
  if (failure) {
    throw failure
  }
}

async function setViewportUserAgent(tabId: number, mobile: boolean): Promise<void> {
  const nativeUserAgent = navigator.userAgent
  const chromeMajor = nativeUserAgent.match(/Chrome\/(\d+)/)?.[1] ?? '134'
  if (!mobile) {
    await sendCdp(tabId, 'Emulation.setUserAgentOverride', { userAgent: nativeUserAgent })
    return
  }
  await sendCdp(tabId, 'Emulation.setUserAgentOverride', {
    userAgent:
      `Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ` +
      `AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${chromeMajor}.0.0.0 ` +
      'Mobile/15E148 Safari/604.1',
    userAgentMetadata: {
      architecture: '',
      brands: [
        { brand: 'Google Chrome', version: chromeMajor },
        { brand: 'Chromium', version: chromeMajor },
        { brand: 'Not/A)Brand', version: '24' }
      ],
      fullVersion: `${chromeMajor}.0.0.0`,
      fullVersionList: [
        { brand: 'Google Chrome', version: `${chromeMajor}.0.0.0` },
        { brand: 'Chromium', version: `${chromeMajor}.0.0.0` },
        { brand: 'Not/A)Brand', version: '24.0.0.0' }
      ],
      mobile: true,
      model: 'iPhone',
      platform: 'iOS',
      platformVersion: '17.0'
    }
  })
}
