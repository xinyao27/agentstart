import { translate } from '../i18n/translate'
import { isClaimedPreviewUrl } from './preview-claim'
import { readProjectName } from './project-groups'
import { readRecentProjects } from './project-history'
import { focusOrCreatePage, focusOrCreateWorkspace } from './workspace-navigation'

const CONTEXT_MENU_ID = 'yiru-use-context'
const ACTION_ACTIVITY_MENU_ID = 'yiru-action-activity'
const ACTION_AUTOMATIONS_MENU_ID = 'yiru-action-automations'
const ACTION_SETTINGS_MENU_ID = 'yiru-action-settings'

export async function configureChromeEntrypoints(): Promise<void> {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  await configureContextMenu()
  const tabs = await chrome.tabs.query({ active: true })
  await Promise.all(tabs.map((tab) => updateActionForTab(tab)))
}

export function registerChromeEntrypointListeners(): void {
  chrome.omnibox.onInputEntered.addListener((text) => {
    const projectId = text.trim()
    if (projectId) {
      void focusOrCreateWorkspace({ projectId })
    }
  })

  chrome.omnibox.onInputChanged.addListener((text, suggest) => {
    void readRecentProjects().then(async (projectIds) => {
      const projects = await Promise.all(
        projectIds.map(async (projectId) => ({
          displayName: (await readProjectName(projectId)) ?? projectId,
          projectId
        }))
      )
      const query = text.trim().toLowerCase()
      const matches = projects
        .filter(
          (project) =>
            project.projectId.toLowerCase().includes(query) ||
            project.displayName.toLowerCase().includes(query)
        )
        .slice(0, 5)
      suggest(
        matches.map((project) => ({
          content: project.projectId,
          description: project.displayName
        }))
      )
    })
  })

  chrome.commands.onCommand.addListener((command) => {
    if (command === 'open-yiru') {
      void chrome.windows.getLastFocused().then((window) => {
        if (window.id === undefined) {
          return
        }
        // Why: Chrome can lose the command's user activation while waking an MV3 worker.
        // The workspace page is the reliable keyboard-entry fallback.
        return chrome.sidePanel
          .open({ windowId: window.id })
          .catch(() => focusOrCreatePage('activity'))
      })
    }
  })

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === ACTION_ACTIVITY_MENU_ID) {
      void focusOrCreatePage('activity')
      return
    }
    if (info.menuItemId === ACTION_AUTOMATIONS_MENU_ID) {
      void focusOrCreatePage('automations')
      return
    }
    if (info.menuItemId === ACTION_SETTINGS_MENU_ID) {
      void chrome.runtime.openOptionsPage()
      return
    }
    if (info.menuItemId !== CONTEXT_MENU_ID) {
      return
    }
    void chrome.storage.session.set({
      pendingPageContext: {
        imageUrl: info.srcUrl ?? null,
        linkUrl: info.linkUrl ?? null,
        pageUrl: info.pageUrl,
        selectionText: info.selectionText ?? null
      }
    })
    if (tab?.id !== undefined) {
      void chrome.sidePanel.open({ tabId: tab.id }).catch(() => focusOrCreatePage('activity'))
    }
  })

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    void chrome.tabs.get(tabId).then(updateActionForTab)
  })

  chrome.tabs.onUpdated.addListener((_tabId, change, tab) => {
    if (change.url || change.status === 'complete') {
      void updateActionForTab(tab)
      if (change.status === 'complete') {
        void injectForgeAction(tab)
      }
    }
  })
}

export async function injectForgeAction(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined || !isForgeWorkItem(tab.url)) {
    return
  }
  const hasPermission = await chrome.permissions.contains({
    origins: [`${new URL(tab.url ?? '').origin}/*`],
    permissions: ['scripting']
  })
  if (!hasPermission) {
    return
  }
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const existing = document.getElementById('yiru-forge-action')
      if (existing) {
        return
      }
      const button = document.createElement('button')
      button.id = 'yiru-forge-action'
      button.type = 'button'
      button.textContent =
        chrome.i18n.getMessage('forgeAction') || chrome.i18n.getMessage('appName')
      button.style.cssText =
        'position:fixed;right:16px;bottom:16px;z-index:2147483646;padding:8px 12px;border:1px solid #2563eb;background:#2563eb;color:white;font:600 13px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.18);cursor:pointer'
      button.addEventListener('click', () => {
        void chrome.runtime.sendMessage({ type: 'forge-action-open' })
      })
      document.documentElement.append(button)
    }
  })
}

async function configureContextMenu(): Promise<void> {
  await chrome.contextMenus.removeAll()
  chrome.contextMenus.create({
    contexts: ['selection', 'link', 'image'],
    id: CONTEXT_MENU_ID,
    title: translate('useAsContext', 'Use in Yiru')
  })
  chrome.contextMenus.create({
    contexts: ['action'],
    id: ACTION_ACTIVITY_MENU_ID,
    title: translate('openActivity', 'Open activity')
  })
  chrome.contextMenus.create({
    contexts: ['action'],
    id: ACTION_AUTOMATIONS_MENU_ID,
    title: translate('openAutomations', 'Open automations')
  })
  chrome.contextMenus.create({
    contexts: ['action'],
    id: ACTION_SETTINGS_MENU_ID,
    title: translate('openSettings', 'Open settings')
  })
}

async function updateActionForTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined) {
    return
  }
  const actionKind = isForgeWorkItem(tab.url)
    ? 'forge'
    : isClaimedPreviewUrl(tab.url)
      ? 'preview'
      : 'default'
  const title =
    actionKind === 'forge'
      ? translate('forgeAction', 'Handle in Yiru')
      : actionKind === 'preview'
        ? translate('previewAction', 'Inspect with Yiru')
        : translate('openSidePanel', 'Open Yiru side panel')
  await Promise.all([
    chrome.action.setTitle({ tabId: tab.id, title }),
    setActionIcon(tab.id, actionKind)
  ])
}

function isForgeWorkItem(rawUrl: string | undefined): boolean {
  if (!rawUrl) {
    return false
  }
  try {
    const url = new URL(rawUrl)
    return (
      url.hostname === 'github.com' && /^\/[^/]+\/[^/]+\/(pull|issues)\/\d+\/?$/.test(url.pathname)
    )
  } catch {
    return false
  }
}

const actionIconCache = new Map<string, ImageData>()

async function setActionIcon(tabId: number, kind: 'default' | 'forge' | 'preview'): Promise<void> {
  let imageData = actionIconCache.get(kind)
  if (!imageData) {
    const response = await fetch(chrome.runtime.getURL('icons/icon-32.png'))
    const bitmap = await createImageBitmap(await response.blob())
    const canvas = new OffscreenCanvas(32, 32)
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }
    context.drawImage(bitmap, 0, 0, 32, 32)
    if (kind !== 'default') {
      context.beginPath()
      context.arc(25, 25, 6, 0, Math.PI * 2)
      context.fillStyle = kind === 'forge' ? '#2563eb' : '#16a34a'
      context.fill()
      context.lineWidth = 2
      context.strokeStyle = '#ffffff'
      context.stroke()
    }
    imageData = context.getImageData(0, 0, 32, 32)
    actionIconCache.set(kind, imageData)
  }
  await chrome.action.setIcon({ imageData, tabId })
}
