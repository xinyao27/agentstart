import type { ExtensionPage } from '@agentstart/client/extension-bootstrap'

import { queueWorkbenchPageCommand } from '../workspace/page-commands'
import { addTabToProjectGroup } from './project-groups'
import { rememberProject } from './project-history'
import {
  isSameWorkspaceUrl,
  mostRecentlyUsedTab,
  selectWorkspaceTab
} from './workspace-tab-selection'

export { workspaceTabProjectId } from './workspace-tab-selection'

export type WorkspaceNavigationTarget = {
  projectId: string
  sessionId?: string
  worktreeId?: string
}

export type GlobalPage = Exclude<ExtensionPage, 'search'>

export async function focusOrCreateWorkspace(
  target: WorkspaceNavigationTarget,
  sourceWindowId?: number
): Promise<void> {
  await rememberProject(target.projectId)
  const workspaceUrl = buildWorkspaceUrl(target)
  const tabs = await queryWorkbenchTabs(sourceWindowId)
  const matchingTab = selectWorkspaceTab(tabs, target)
  if (matchingTab?.id === undefined) {
    const tab = await chrome.tabs.create({
      active: true,
      ...(sourceWindowId === undefined ? {} : { windowId: sourceWindowId }),
      url: workspaceUrl
    })
    await addTabToProjectGroup(tab.id, target.projectId)
    return
  }
  await chrome.tabs.update(matchingTab.id, {
    active: true,
    ...(isSameWorkspaceUrl(matchingTab.url, workspaceUrl) ? {} : { url: workspaceUrl })
  })
  await addTabToProjectGroup(matchingTab.id, target.projectId)
  if (matchingTab.windowId !== undefined) {
    await chrome.windows.update(matchingTab.windowId, { focused: true })
  }
}

export async function focusOrCreatePage(page: GlobalPage, sourceWindowId?: number): Promise<void> {
  const resolvedWindowId = sourceWindowId ?? (await lastFocusedWindowId())
  const tabs = await queryWorkbenchTabs(resolvedWindowId)
  const matchingTab = mostRecentlyUsedTab(tabs)
  if (matchingTab?.id === undefined) {
    await chrome.tabs.create({
      active: true,
      ...(resolvedWindowId === undefined ? {} : { windowId: resolvedWindowId }),
      url: buildPageColdStartUrl(page)
    })
    return
  }
  // Why: storage.session is a targeted, durable inbox for discarded extension
  // tabs. Queue before activation so a restored renderer cannot miss the command.
  await queueWorkbenchPageCommand(matchingTab.id, page)
  await chrome.tabs.update(matchingTab.id, { active: true })
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

function buildPageColdStartUrl(page: GlobalPage): string {
  const url = new URL(chrome.runtime.getURL('workspace.html'))
  url.searchParams.set('view', page)
  return url.href
}

async function queryWorkbenchTabs(windowId?: number): Promise<chrome.tabs.Tab[]> {
  return chrome.tabs.query({
    url: `${chrome.runtime.getURL('workspace.html')}*`,
    ...(windowId === undefined ? {} : { windowId })
  })
}

async function lastFocusedWindowId(): Promise<number | undefined> {
  return chrome.windows.getLastFocused().then(
    (window) => window.id,
    () => undefined
  )
}
