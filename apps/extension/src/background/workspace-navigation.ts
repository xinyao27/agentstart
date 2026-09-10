import { addTabToProjectGroup } from './project-groups'
import { rememberProject } from './project-history'
import { selectWorkspaceTab } from './workspace-tab-selection'

export { workspaceTabProjectId } from './workspace-tab-selection'

export type WorkspaceNavigationTarget = {
  dedicated?: boolean
  projectId: string
  sessionId?: string
  worktreeId?: string
}

export type GlobalPage = 'activity' | 'browser' | 'mobile' | 'search' | 'settings' | 'skills'

export async function focusOrCreateWorkspace(target: WorkspaceNavigationTarget): Promise<void> {
  await rememberProject(target.projectId)
  const workspaceUrl = buildWorkspaceUrl(target)
  const tabs = await chrome.tabs.query({ url: `${chrome.runtime.getURL('workspace.html')}*` })
  const matchingTab = selectWorkspaceTab(tabs, target)
  if (matchingTab?.id === undefined) {
    const tab = await chrome.tabs.create({ active: true, url: workspaceUrl })
    await addTabToProjectGroup(tab.id, target.projectId)
    return
  }
  await chrome.tabs.update(matchingTab.id, { active: true, url: workspaceUrl })
  await addTabToProjectGroup(matchingTab.id, target.projectId)
  if (matchingTab.windowId !== undefined) {
    await chrome.windows.update(matchingTab.windowId, { focused: true })
  }
}

export async function focusOrCreatePage(page: GlobalPage): Promise<void> {
  const pageUrl = buildPageUrl(page)
  const tabs = await chrome.tabs.query({ url: `${chrome.runtime.getURL('workspace.html')}*` })
  const matchingTab = tabs.find((tab) => workspaceTabPage(tab.url) === page)
  if (matchingTab?.id === undefined) {
    await chrome.tabs.create({ active: true, url: pageUrl })
    return
  }
  await chrome.tabs.update(matchingTab.id, { active: true, url: pageUrl })
  if (matchingTab.windowId !== undefined) {
    await chrome.windows.update(matchingTab.windowId, { focused: true })
  }
}

export async function focusOrCreateExternalUrl(url: string, projectId?: string): Promise<void> {
  const parsed = new URL(url)
  if (!['about:', 'http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('external_tab_protocol_unsupported')
  }
  const destination = parsed.href === 'about:blank' ? 'chrome://newtab/' : parsed.href
  const tabs = parsed.protocol === 'about:' ? [] : await chrome.tabs.query({ url: destination })
  const existing = tabs[0]
  const tab =
    existing?.id === undefined
      ? await chrome.tabs.create({ active: true, url: destination })
      : await chrome.tabs.update(existing.id, { active: true })
  if (!tab) {
    throw new Error('external_tab_unavailable')
  }
  if (projectId) {
    await addTabToProjectGroup(tab.id, projectId)
  }
  if (tab.windowId !== undefined) {
    await chrome.windows.update(tab.windowId, { focused: true })
  }
}

export function buildWorkspaceUrl(target: WorkspaceNavigationTarget): string {
  const url = new URL(chrome.runtime.getURL('workspace.html'))
  url.searchParams.set('project', target.projectId)
  if (target.worktreeId) {
    url.searchParams.set('worktree', target.worktreeId)
  }
  if (target.sessionId) {
    url.searchParams.set('session', target.sessionId)
  }
  return url.href
}

function buildPageUrl(page: GlobalPage): string {
  const url = new URL(chrome.runtime.getURL('workspace.html'))
  url.searchParams.set('view', page)
  return url.href
}

function workspaceTabPage(url: string | undefined): string | null {
  if (!url) {
    return null
  }
  try {
    return new URL(url).searchParams.get('view')
  } catch {
    return null
  }
}
