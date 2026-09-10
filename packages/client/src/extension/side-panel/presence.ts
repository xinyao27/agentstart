const SIDE_PANEL_PRESENCE_CHANNEL = 'agentstart-side-panel-presence-v1'
const SIDE_PANEL_HEARTBEAT_INTERVAL_MS = 1_000
const SIDE_PANEL_HEARTBEAT_TIMEOUT_MS = 2_500

type SidePanelPresenceMessage =
  | {
      instanceId: string
      kind: 'presence'
      state: 'closed' | 'open'
      windowId: number
    }
  | {
      kind: 'query'
      windowId: number
    }

const presenceListeners = new Set<() => void>()
const presenceExpiryByInstanceId = new Map<string, number>()
let presenceChannel: BroadcastChannel | null = null
let presenceExpiryTimer: ReturnType<typeof setTimeout> | null = null
let isSidePanelPresent = false

export function getSidePanelPresenceSnapshot(): boolean {
  return isSidePanelPresent
}

export function subscribeSidePanelPresence(listener: () => void): () => void {
  presenceListeners.add(listener)
  ensurePresenceListener()
  return () => presenceListeners.delete(listener)
}

export function publishSidePanelPresence(): () => void {
  const windowId = readBrowserWindowId()
  if (windowId === null || typeof BroadcastChannel === 'undefined') {
    return () => {}
  }

  const channel = new BroadcastChannel(SIDE_PANEL_PRESENCE_CHANNEL)
  const instanceId = crypto.randomUUID()
  let hasPublishedOpen = false
  let heartbeat: number | null = null

  const publish = (state: 'closed' | 'open'): void => {
    channel.postMessage({ instanceId, kind: 'presence', state, windowId })
    hasPublishedOpen = state === 'open'
  }
  const stopHeartbeat = (): void => {
    if (heartbeat !== null) {
      window.clearInterval(heartbeat)
      heartbeat = null
    }
  }
  const startHeartbeat = (): void => {
    if (heartbeat !== null || document.visibilityState === 'hidden') {
      return
    }
    heartbeat = window.setInterval(() => publish('open'), SIDE_PANEL_HEARTBEAT_INTERVAL_MS)
  }
  const publishVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      stopHeartbeat()
      if (hasPublishedOpen) {
        publish('closed')
      }
      return
    }
    publish('open')
    startHeartbeat()
  }
  const handleMessage = (event: MessageEvent<unknown>): void => {
    const message = parsePresenceMessage(event.data)
    if (message?.kind === 'query' && message.windowId === windowId) {
      publishVisibility()
    }
  }
  const handlePageHide = (): void => {
    stopHeartbeat()
    publish('closed')
  }

  channel.addEventListener('message', handleMessage)
  document.addEventListener('visibilitychange', publishVisibility)
  window.addEventListener('pagehide', handlePageHide)
  publishVisibility()

  return () => {
    stopHeartbeat()
    document.removeEventListener('visibilitychange', publishVisibility)
    window.removeEventListener('pagehide', handlePageHide)
    channel.removeEventListener('message', handleMessage)
    if (hasPublishedOpen) {
      publish('closed')
    }
    channel.close()
  }
}

function ensurePresenceListener(): void {
  const windowId = readBrowserWindowId()
  if (presenceChannel || windowId === null || typeof BroadcastChannel === 'undefined') {
    return
  }

  presenceChannel = new BroadcastChannel(SIDE_PANEL_PRESENCE_CHANNEL)
  presenceChannel.addEventListener('message', (event: MessageEvent<unknown>) => {
    const message = parsePresenceMessage(event.data)
    if (message?.kind !== 'presence' || message.windowId !== windowId) {
      return
    }
    if (message.state === 'closed') {
      presenceExpiryByInstanceId.delete(message.instanceId)
    } else {
      presenceExpiryByInstanceId.set(
        message.instanceId,
        Date.now() + SIDE_PANEL_HEARTBEAT_TIMEOUT_MS
      )
    }
    commitPresenceSnapshot()
  })
  presenceChannel.postMessage({ kind: 'query', windowId } satisfies SidePanelPresenceMessage)
}

function commitPresenceSnapshot(): void {
  const now = Date.now()
  for (const [instanceId, expiresAt] of presenceExpiryByInstanceId) {
    if (expiresAt <= now) {
      presenceExpiryByInstanceId.delete(instanceId)
    }
  }

  const nextSnapshot = presenceExpiryByInstanceId.size > 0
  if (nextSnapshot !== isSidePanelPresent) {
    isSidePanelPresent = nextSnapshot
    for (const listener of presenceListeners) {
      listener()
    }
  }

  if (presenceExpiryTimer) {
    clearTimeout(presenceExpiryTimer)
    presenceExpiryTimer = null
  }
  const nextExpiry = Math.min(...presenceExpiryByInstanceId.values())
  if (Number.isFinite(nextExpiry)) {
    presenceExpiryTimer = setTimeout(commitPresenceSnapshot, Math.max(0, nextExpiry - now))
  }
}

function parsePresenceMessage(value: unknown): SidePanelPresenceMessage | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const kind = Reflect.get(value, 'kind')
  const windowId = Reflect.get(value, 'windowId')
  if (!Number.isInteger(windowId)) {
    return null
  }
  if (kind === 'query') {
    return { kind, windowId: Number(windowId) }
  }
  const instanceId = Reflect.get(value, 'instanceId')
  const state = Reflect.get(value, 'state')
  if (
    kind !== 'presence' ||
    typeof instanceId !== 'string' ||
    (state !== 'closed' && state !== 'open')
  ) {
    return null
  }
  return { instanceId, kind, state, windowId: Number(windowId) }
}

function readBrowserWindowId(): number | null {
  const value = Reflect.get(globalThis, '__AGENTSTART_BROWSER_WINDOW_ID__')
  return Number.isInteger(value) ? Number(value) : null
}
