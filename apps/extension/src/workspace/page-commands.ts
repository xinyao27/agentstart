import type {
  ExtensionPageCommand,
  ExtensionPageIntent,
  ExtensionPageSubscription,
  ExtensionShellModalData
} from '@agentstart/client/extension-bootstrap'

const PAGE_COMMAND_KEY_PREFIX = 'workbenchPageCommand.v1:'

type StoredPageCommand = ExtensionPageCommand & {
  issuedAt: number
}

export async function queueWorkbenchPageCommand(
  tabId: number,
  intent: ExtensionPageIntent,
  data?: ExtensionShellModalData
): Promise<void> {
  const key = `${pageCommandKeyPrefix(tabId)}${crypto.randomUUID()}`
  await chrome.storage.session.set({
    [key]: {
      issuedAt: Date.now(),
      page: intent,
      ...(data === undefined ? {} : { data })
    } satisfies StoredPageCommand
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
      listener({
        page: command.page,
        ...(command.data === undefined ? {} : { data: command.data })
      })
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
  const page = parsePageIntent(Reflect.get(value, 'page'))
  if (typeof issuedAt !== 'number' || !Number.isFinite(issuedAt) || !page) {
    return null
  }
  const data = parseShellModalData(Reflect.get(value, 'data'))
  return data === null ? null : { issuedAt, page, ...(data === undefined ? {} : { data }) }
}

// Why: only primitives survive the storage round trip a handoff uses, so this is
// the one gate both the background message and the stored command are read through.
// Returns undefined when the command carries no data, null when the data is unusable.
export function parseShellModalData(value: unknown): ExtensionShellModalData | undefined | null {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const data: ExtensionShellModalData = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
      data[key] = entry
      continue
    }
    if (Array.isArray(entry) && entry.every((item) => typeof item === 'string')) {
      data[key] = entry
      continue
    }
    return null
  }
  return data
}

function parsePageIntent(value: unknown): ExtensionPageIntent | null {
  switch (value) {
    case 'activity':
    case 'add-repo':
    case 'delete-worktree':
    case 'mobile':
    case 'new-workspace-composer':
    case 'search':
    case 'settings':
    case 'setup-guide':
    case 'skills':
      return value
    default:
      return null
  }
}
