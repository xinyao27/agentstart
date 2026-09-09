import { readStringArray, requiredString } from './command-value'
import {
  interceptedRequests,
  registerFetchAuthority,
  setFetchCredentials,
  setFetchInterception
} from './fetch-authority'

export function registerBrowserFetchListeners(): void {
  registerFetchAuthority()
}

export async function enableInterception(tabId: number, input: Record<string, unknown>) {
  const patterns = readStringArray(Reflect.get(input, 'patterns')) ?? ['*']
  await setFetchInterception(tabId, patterns)
  return { enabled: true, patterns }
}

export async function disableInterception(tabId: number) {
  await setFetchInterception(tabId, null)
  return { disabled: true }
}

export function listInterceptedRequests(tabId: number) {
  return { requests: interceptedRequests(tabId) }
}

export async function setCredentials(tabId: number, input: Record<string, unknown>) {
  await setFetchCredentials(tabId, {
    password: requiredString(input, 'pass', true),
    username: requiredString(input, 'user')
  })
  return { configured: true }
}
