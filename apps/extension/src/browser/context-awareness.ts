import { requestBrowserPermissions } from './permission'

const CONTEXT_AWARENESS_PERMISSIONS: chrome.permissions.Permissions = {
  origins: ['http://127.0.0.1/*', 'http://localhost/*', 'https://github.com/*'],
  permissions: ['tabs', 'webNavigation']
}

const REVOCABLE_CONTEXT_AWARENESS_PERMISSIONS: chrome.permissions.Permissions = {
  origins: ['https://github.com/*'],
  permissions: ['tabs', 'webNavigation']
}

export async function enableContextAwareness(): Promise<boolean> {
  const granted = await requestBrowserPermissions(CONTEXT_AWARENESS_PERMISSIONS)
  if (!granted) {
    return false
  }
  await chrome.storage.local.set({ contextAwarenessEnabled: true })
  await chrome.runtime.sendMessage({ type: 'context-awareness-enabled' })
  return true
}

export async function disableContextAwareness(): Promise<void> {
  await chrome.storage.local.set({ contextAwarenessEnabled: false })
  await chrome.permissions.remove(REVOCABLE_CONTEXT_AWARENESS_PERMISSIONS)
}

export async function isContextAwarenessEnabled(): Promise<boolean> {
  const stored: unknown = await chrome.storage.local.get('contextAwarenessEnabled')
  const isEnabled =
    typeof stored === 'object' &&
    stored !== null &&
    Reflect.get(stored, 'contextAwarenessEnabled') === true
  return isEnabled && chrome.permissions.contains(CONTEXT_AWARENESS_PERMISSIONS)
}
