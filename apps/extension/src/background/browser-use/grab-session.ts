import { clampGrabPayload } from './grab-payload'
import type { BrowserGrabCancelReason, BrowserGrabResult } from './grab/model'

const GRAB_OP_TIMEOUT_MS = 120_000

type ActiveGrab = {
  cleanup: (preserveOverlay?: boolean) => void
  opId: string
  resolve: (result: BrowserGrabResult) => void
  skipTeardown?: boolean
}

type GrabEvaluator = (action: 'awaitClick' | 'teardown') => Promise<unknown>

export class BrowserGrabSessionController {
  private readonly activeGrabs = new Map<number, ActiveGrab>()

  cancel(tabId: number, reason: BrowserGrabCancelReason): void {
    const active = this.activeGrabs.get(tabId)
    active?.resolve({ kind: 'cancelled', opId: active.opId, reason })
  }

  awaitSelection(tabId: number, opId: string, evaluate: GrabEvaluator): Promise<BrowserGrabResult> {
    const existing = this.activeGrabs.get(tabId)
    if (existing) {
      existing.skipTeardown = true
      existing.resolve({ kind: 'cancelled', opId: existing.opId, reason: 'user' })
    }

    return new Promise((resolve) => {
      let settled = false
      const settleOnce = (result: BrowserGrabResult): void => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timeoutId)
        active.cleanup(result.kind === 'selected' || result.kind === 'context-selected')
        if (this.activeGrabs.get(tabId) === active) {
          this.activeGrabs.delete(tabId)
        }
        resolve(result)
      }
      const cleanup = (preserveOverlay?: boolean): void => {
        if (!active.skipTeardown && !preserveOverlay) {
          void evaluate('teardown').catch(() => undefined)
        }
      }
      const active: ActiveGrab = { cleanup, opId, resolve: settleOnce }
      const timeoutId = setTimeout(
        () => settleOnce({ kind: 'cancelled', opId, reason: 'timeout' }),
        GRAB_OP_TIMEOUT_MS
      )
      this.activeGrabs.set(tabId, active)
      void evaluate('awaitClick').then(
        (rawPayload) => settleOnce(parseSelection(rawPayload, opId)),
        (error: unknown) => {
          const message = guestErrorMessage(error)
          settleOnce(
            message.includes('cancelled')
              ? { kind: 'cancelled', opId, reason: 'user' }
              : { kind: 'error', opId, reason: message }
          )
        }
      )
    })
  }
}

function parseSelection(rawPayload: unknown, opId: string): BrowserGrabResult {
  if (!rawPayload || typeof rawPayload !== 'object') {
    return { kind: 'cancelled', opId, reason: 'user' }
  }
  if (isGuestCancellationPayload(rawPayload)) {
    return { kind: 'cancelled', opId, reason: 'user' }
  }
  const isContextMenu = Reflect.get(rawPayload, '__agentstartContextMenu') === true
  const payloadSource = isContextMenu ? Reflect.get(rawPayload, 'payload') : rawPayload
  const payload = clampGrabPayload(payloadSource)
  if (!payload) {
    return { kind: 'error', opId, reason: 'Guest returned invalid payload structure' }
  }
  return { kind: isContextMenu ? 'context-selected' : 'selected', opId, payload }
}

function isGuestCancellationPayload(rawPayload: object): boolean {
  if (Reflect.get(rawPayload, '__agentstartCancelled') === true) {
    return true
  }
  if (Reflect.get(rawPayload, 'message') !== 'cancelled') {
    return false
  }
  return !('page' in rawPayload) && !('target' in rawPayload) && !('payload' in rawPayload)
}

function guestErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (error && typeof error === 'object') {
    const message = Reflect.get(error, 'message')
    if (typeof message === 'string') {
      return message
    }
  }
  return 'Selection failed'
}
