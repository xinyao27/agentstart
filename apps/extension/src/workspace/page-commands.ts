import type {
  ExtensionPage,
  ExtensionPageSubscription
} from '@agentstart/client/extension-bootstrap'

const PAGE_COMMAND_KEY_PREFIX = 'workbenchPageCommand.v1:'

type StoredPageCommand = {
  issuedAt: number
  page: ExtensionPage
}

export async function queueWorkbenchPageCommand(tabId: number, page: ExtensionPage): Promise<void> {
  const key = `${pageCommandKeyPrefix(tabId)}${crypto.randomUUID()}`
  await chrome.storage.session.set({
    [key]: { issuedAt: Date.now(), page } satisfies StoredPageCommand
  })
}

export async function clearWorkbenchPageCommands(tabId: number): Promise<void> {
  const stored: unknown = await chrome.storage.session.get()
  if (typeof stored !== 'object' || stored === null) {
    return
  }
  const prefix = pageCommandKeyPrefix(tabId)
  const keys = Object.keys(stored).filter((key) => key.startsWith(prefix))
  if (keys.length > 0) {
    await chrome.storage.session.remove(keys)
  }
}

export function createWorkbenchPageCommandInbox(
  tabIdPromise: Promise<number | null>
): ExtensionPageSubscription {
  const deliveredKeys = new Set<string>()
  const pending = new Map<string, StoredPageCommand>()
  let listener: Parameters<ExtensionPageSubscription>[0] | null = null

  const flush = (): void => {
    if (!listener) {
      return
    }
    const commands = [...pending].toSorted(
      ([leftKey, left], [rightKey, right]) =>
        left.issuedAt - right.issuedAt || leftKey.localeCompare(rightKey)
    )
    pending.clear()
    for (const [key, command] of commands) {
      deliveredKeys.add(key)
      listener(command.page)
      void chrome.storage.session.remove(key).catch((error: unknown) => {
        console.error('[workspace] Failed to consume page command', error)
      })
    }
  }

  const accept = (key: string, value: unknown): void => {
    if (deliveredKeys.has(key) || pending.has(key)) {
      return
    }
    void tabIdPromise.then((tabId) => {
      if (tabId === null || !key.startsWith(pageCommandKeyPrefix(tabId))) {
        return
      }
      const command = parseStoredPageCommand(value)
      if (!command) {
        return
      }
      pending.set(key, command)
      flush()
    })
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'session') {
      return
    }
    for (const [key, change] of Object.entries(changes)) {
      if (change.newValue !== undefined) {
        accept(key, change.newValue)
      }
    }
  })
  void tabIdPromise.then(async (tabId) => {
    if (tabId === null) {
      return
    }
    const stored: unknown = await chrome.storage.session.get()
    if (typeof stored !== 'object' || stored === null) {
      return
    }
    for (const [key, value] of Object.entries(stored)) {
      accept(key, value)
    }
  })

  return (nextListener) => {
    listener = nextListener
    flush()
    return () => {
      if (listener === nextListener) {
        listener = null
      }
    }
  }
}

function pageCommandKeyPrefix(tabId: number): string {
  return `${PAGE_COMMAND_KEY_PREFIX}${tabId}:`
}

function parseStoredPageCommand(value: unknown): StoredPageCommand | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const issuedAt = Reflect.get(value, 'issuedAt')
  const page = parseExtensionPage(Reflect.get(value, 'page'))
  return typeof issuedAt === 'number' && Number.isFinite(issuedAt) && page
    ? { issuedAt, page }
    : null
}

function parseExtensionPage(value: unknown): ExtensionPage | null {
  switch (value) {
    case 'activity':
    case 'mobile':
    case 'search':
    case 'settings':
    case 'skills':
      return value
    default:
      return null
  }
}
