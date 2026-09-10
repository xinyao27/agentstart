import type {
  BrowserAnnotationViewportInput,
  BrowserPageRegisterInput,
  BrowserPageUnregisterInput,
  BrowserViewportOverrideInput
} from './control-input'
import { discardBrowserGrab, releaseBrowserGrab } from './grab'
import { releasePageAnnotationViewport, setPageAnnotationViewport } from './page-annotation'
import {
  authorizedRegistrationGeneration,
  discardPageRegistration,
  pageRegistryReady,
  removePageRegistration,
  replacePageRegistration,
  registrationGeneration,
  registrationForTab
} from './page-registry'
import { discardPageViewport, releasePageViewport, setPageViewport } from './page-viewport'
import {
  browserPageId,
  isControllableBrowserTab,
  parseBrowserPageId,
  rememberBrowserTab
} from './target'

export function registerBrowserPageControlListeners(): void {
  void pageRegistryReady
  chrome.tabs.onRemoved.addListener((tabId) => {
    discardPageRegistration(tabId)
    discardBrowserGrab(tabId)
    void discardPageViewport(tabId)
    void releasePageAnnotationViewport(tabId).catch(() => undefined)
  })
}

export async function executeBrowserPageControl(
  method: string,
  input: object,
  authorityId: string | null
): Promise<unknown> {
  await pageRegistryReady
  switch (method) {
    case 'browser.pageControl.register':
      return registerPage(input as BrowserPageRegisterInput, authorityId)
    case 'browser.pageControl.unregister':
      return unregisterPage(input as BrowserPageUnregisterInput, authorityId)
    case 'browser.pageControl.setActive':
      return setActive(input, authorityId)
    case 'browser.pageControl.openDevTools':
      return { accepted: false }
    case 'browser.pageControl.setViewportOverride':
      return setViewportOverride(input as BrowserViewportOverrideInput, authorityId)
    case 'browser.pageControl.setAnnotationViewport':
      return setAnnotationViewport(input as BrowserAnnotationViewportInput, authorityId)
    default:
      throw new Error(`browser_page_control_unsupported:${method}`)
  }
}

async function registerPage(
  input: BrowserPageRegisterInput,
  authorityId: string | null
): Promise<{ accepted: boolean }> {
  if (authorityId === null) {
    return { accepted: false }
  }
  const tabId = parseBrowserPageId(input.browserPageId)
  const tab = await chrome.tabs.get(tabId).catch(() => null)
  if (!tab || !isControllableBrowserTab(tab) || browserPageId(tabId) !== input.browserPageId) {
    return { accepted: false }
  }
  const accepted = await replacePageRegistration(
    tabId,
    {
      authorityId,
      backendPageId: input.backendPageId,
      generation: crypto.randomUUID(),
      sessionProfileId: input.sessionProfileId ?? null,
      workspaceId: input.workspaceId,
      worktreeId: input.worktreeId
    },
    () => clearPageOwnedState(tabId)
  )
  if (!accepted) {
    return { accepted: false }
  }
  void rememberBrowserTab(tab).catch(() => undefined)
  return { accepted: true }
}

async function unregisterPage(
  input: BrowserPageUnregisterInput,
  authorityId: string | null
): Promise<{ accepted: boolean }> {
  const tabId = parseBrowserPageId(input.browserPageId)
  const registered = registrationForTab(tabId)
  if (
    !registered ||
    registered.authorityId !== authorityId ||
    registered.backendPageId !== input.expectedBackendPageId
  ) {
    return { accepted: false }
  }
  return { accepted: await removePageRegistration(tabId, () => clearPageOwnedState(tabId)) }
}

async function setActive(
  input: object,
  authorityId: string | null
): Promise<{ accepted: boolean }> {
  const tab = await authorizedTab(input, authorityId)
  if (!tab) {
    return { accepted: false }
  }
  void rememberBrowserTab(tab).catch(() => undefined)
  return { accepted: true }
}

async function setViewportOverride(
  input: BrowserViewportOverrideInput,
  authorityId: string | null
): Promise<{ accepted: boolean }> {
  const tabId = parseBrowserPageId(input.browserPageId)
  const generation = authorizedRegistrationGeneration(tabId, authorityId)
  if (!generation) {
    return { accepted: false }
  }
  return setPageViewport(tabId, input.override, () => registrationGeneration(tabId) === generation)
}

async function setAnnotationViewport(
  input: BrowserAnnotationViewportInput,
  authorityId: string | null
): Promise<{ accepted: boolean }> {
  const tabId = parseBrowserPageId(input.browserPageId)
  const generation = authorizedRegistrationGeneration(tabId, authorityId)
  if (!generation) {
    return { accepted: false }
  }
  return setPageAnnotationViewport(tabId, input, () => registrationGeneration(tabId) === generation)
}

async function authorizedTab(
  input: object,
  authorityId: string | null
): Promise<chrome.tabs.Tab | null> {
  const pageId = Reflect.get(input, 'browserPageId')
  if (typeof pageId !== 'string') {
    return null
  }
  const tabId = parseBrowserPageId(pageId)
  return authorizedRegistrationGeneration(tabId, authorityId)
    ? chrome.tabs.get(tabId).catch(() => null)
    : null
}

async function clearPageOwnedState(tabId: number): Promise<void> {
  await Promise.all([
    releaseBrowserGrab(tabId),
    releasePageViewport(tabId),
    releasePageAnnotationViewport(tabId)
  ])
}
