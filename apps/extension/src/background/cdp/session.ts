export type CdpOwner =
  | 'browser-annotation'
  | 'browser-capture'
  | 'browser-environment'
  | 'browser-fetch'
  | 'browser-grab'
  | 'browser-use'
  | 'browser-viewport'
  | 'console-sensor'
  | 'network-mock'
  | 'pdf-export'
  | 'performance-audit'
  | 'recorder'
  | 'visual-capture'

type CdpEventListener = (tabId: number, method: string, params: Record<string, unknown>) => void

type CdpRecoveryHandler = {
  complete: (tabId: number) => Promise<void>
  prepare: (tabId: number) => Promise<boolean>
}

type CdpSession = {
  attached: boolean
  operation: Promise<void>
  owners: Map<CdpOwner, number>
}

const sessionsByTab = new Map<number, CdpSession>()
const listeners = new Set<CdpEventListener>()
const recoveryHandlers = new Set<CdpRecoveryHandler>()
let hasRegisteredChromeListeners = false
const ATTACHMENT_KEY_PREFIX = 'cdpAttachment.v1:'
const ATTACHMENT_RECOVERY_TIMEOUT_MS = 2_000

export function registerCdpSessionListeners(): void {
  if (!chrome.debugger || hasRegisteredChromeListeners) {
    return
  }
  hasRegisteredChromeListeners = true
  chrome.debugger.onEvent.addListener((source, method, params) => {
    if (source.tabId === undefined) {
      return
    }
    const eventParams: Record<string, unknown> = params ?? {}
    for (const listener of listeners) {
      listener(source.tabId, method, eventParams)
    }
  })

  chrome.debugger.onDetach.addListener((source) => {
    if (source.tabId !== undefined) {
      const session = sessionsByTab.get(source.tabId)
      if (session) {
        session.attached = false
        session.owners.clear()
      }
      void forgetPersistedAttachment(source.tabId)
    }
  })
  chrome.tabs.onRemoved.addListener((tabId) => {
    sessionsByTab.delete(tabId)
    void forgetPersistedAttachment(tabId)
  })
}

export async function acquireCdp(tabId: number, owner: CdpOwner): Promise<void> {
  registerCdpSessionListeners()
  const session = cdpSession(tabId)
  await enqueueSessionOperation(session, async () => {
    if (!session.attached) {
      session.attached = await restorePersistedAttachment(tabId)
    }
    if (!session.attached) {
      await chrome.debugger.attach({ tabId }, '1.3')
      try {
        await rememberPersistedAttachment(tabId)
        session.attached = true
      } catch (error) {
        await chrome.debugger.detach({ tabId }).catch(() => undefined)
        throw error
      }
    }
    session.owners.set(owner, (session.owners.get(owner) ?? 0) + 1)
  })
}

export async function releaseCdp(tabId: number, owner: CdpOwner): Promise<void> {
  const session = sessionsByTab.get(tabId)
  if (!session) {
    return
  }
  await enqueueSessionOperation(session, async () => {
    const count = session.owners.get(owner) ?? 0
    if (count > 1) {
      session.owners.set(owner, count - 1)
    } else {
      session.owners.delete(owner)
    }
    if (session.owners.size === 0 && session.attached) {
      try {
        await chrome.debugger.detach({ tabId })
        session.attached = false
        await forgetPersistedAttachment(tabId)
      } catch {
        const tabExists = await chrome.tabs.get(tabId).then(
          () => true,
          () => false
        )
        if (!tabExists) {
          session.attached = false
          await forgetPersistedAttachment(tabId)
        }
      }
    }
  })
}

export function subscribeCdp(listener: CdpEventListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function registerCdpRecovery(handler: CdpRecoveryHandler): void {
  recoveryHandlers.add(handler)
}

export async function sendCdp(
  tabId: number,
  method: string,
  commandParams?: Record<string, unknown>
): Promise<unknown> {
  return chrome.debugger.sendCommand({ tabId }, method, commandParams)
}

export function sendCdpRecoveryCommand(
  tabId: number,
  method: string,
  commandParams?: Record<string, unknown>
): Promise<boolean> {
  return settleRecoveryOperation(chrome.debugger.sendCommand({ tabId }, method, commandParams))
}

function cdpSession(tabId: number): CdpSession {
  const existing = sessionsByTab.get(tabId)
  if (existing) {
    return existing
  }
  const created: CdpSession = {
    attached: false,
    operation: Promise.resolve(),
    owners: new Map()
  }
  sessionsByTab.set(tabId, created)
  return created
}

function enqueueSessionOperation(
  session: CdpSession,
  operation: () => Promise<void>
): Promise<void> {
  const current = session.operation.catch(() => undefined).then(operation)
  session.operation = current
  return current
}

async function restorePersistedAttachment(tabId: number): Promise<boolean> {
  const key = attachmentKey(tabId)
  const stored: unknown = await chrome.storage.session.get(key)
  if (typeof stored !== 'object' || stored === null || Reflect.get(stored, key) !== true) {
    return false
  }
  for (const handler of recoveryHandlers) {
    if (!(await handler.prepare(tabId))) {
      throw new Error('The previous browser operation could not be recovered')
    }
  }
  if (!(await resetPersistedFetchState(tabId))) {
    return finishUnavailableRecovery(tabId)
  }
  if (!(await settleRecoveryOperation(chrome.debugger.detach({ tabId })))) {
    return finishUnavailableRecovery(tabId)
  }
  for (const handler of recoveryHandlers) {
    await handler.complete(tabId)
  }
  await forgetPersistedAttachment(tabId)
  return false
}

async function finishUnavailableRecovery(tabId: number): Promise<boolean> {
  const target = (await chrome.debugger.getTargets()).find((candidate) => candidate.tabId === tabId)
  if (target?.attached) {
    throw new Error('The previous browser session could not be recovered')
  }
  await forgetPersistedAttachment(tabId)
  return false
}

function resetPersistedFetchState(tabId: number): Promise<boolean> {
  return sendCdpRecoveryCommand(tabId, 'Fetch.disable')
}

function settleRecoveryOperation(operation: Promise<unknown>): Promise<boolean> {
  return new Promise((resolve) => {
    let isSettled = false
    const timeout = setTimeout(() => finish(false), ATTACHMENT_RECOVERY_TIMEOUT_MS)
    void operation.then(
      () => finish(true),
      () => finish(false)
    )

    function finish(wasReset: boolean): void {
      if (isSettled) {
        return
      }
      isSettled = true
      clearTimeout(timeout)
      resolve(wasReset)
    }
  })
}

async function rememberPersistedAttachment(tabId: number): Promise<void> {
  await chrome.storage.session.set({ [attachmentKey(tabId)]: true })
}

async function forgetPersistedAttachment(tabId: number): Promise<void> {
  await chrome.storage.session.remove(attachmentKey(tabId))
}

function attachmentKey(tabId: number): string {
  return `${ATTACHMENT_KEY_PREFIX}${tabId}`
}
