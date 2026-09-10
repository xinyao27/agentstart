import type {
  NotificationDismissResult,
  NotificationDisplayInput,
  NotificationDisplayResult
} from '@agentstart/client/notifications'

const WORKBENCH_NOTIFICATION_PREFIX = 'agentstart-workbench:'

export async function displayWorkbenchNotification(
  input: NotificationDisplayInput
): Promise<NotificationDisplayResult> {
  if (!(await chrome.permissions.contains({ permissions: ['notifications'] }))) {
    return { delivered: false, reason: 'blocked-by-system' }
  }
  if (input.suppressWhenFocused && (await hasFocusedWorkbenchTab())) {
    return { delivered: false, reason: 'suppressed-focus' }
  }
  const id = `${WORKBENCH_NOTIFICATION_PREFIX}${input.notificationId ?? crypto.randomUUID()}`
  await chrome.notifications.create(id, {
    iconUrl: chrome.runtime.getURL('icon.png'),
    message: input.body,
    priority: 1,
    silent: !input.useSystemSound,
    title: input.title,
    type: 'basic'
  })
  return { delivered: true }
}

export async function dismissWorkbenchNotifications(
  notificationIds: string[]
): Promise<NotificationDismissResult> {
  const dismissed = await Promise.all(
    notificationIds.map((id) => chrome.notifications.clear(`${WORKBENCH_NOTIFICATION_PREFIX}${id}`))
  )
  return { dismissed: dismissed.filter(Boolean).length }
}

export async function getWorkbenchNotificationPermissionStatus(): Promise<{
  platform: NodeJS.Platform
  requested: boolean
  supported: boolean
}> {
  return {
    platform: browserPlatform(),
    requested: await chrome.permissions.contains({ permissions: ['notifications'] }),
    supported: Boolean(chrome.notifications)
  }
}

export async function probeWorkbenchNotificationDelivery(options?: { force?: boolean }): Promise<{
  authoritative: boolean
  state: 'awaiting-decision' | 'blocked' | 'delivered' | 'unsupported'
}> {
  if (!chrome.notifications) {
    return { authoritative: true, state: 'unsupported' }
  }
  let granted = await chrome.permissions.contains({ permissions: ['notifications'] })
  if (!granted && options?.force) {
    granted = await chrome.permissions.request({ permissions: ['notifications'] })
  }
  return {
    authoritative: true,
    state: granted ? 'delivered' : options?.force ? 'blocked' : 'awaiting-decision'
  }
}

export async function openWorkbenchNotificationSettings(): Promise<void> {
  await chrome.tabs.create({ url: 'chrome://settings/content/notifications' })
}

async function hasFocusedWorkbenchTab(): Promise<boolean> {
  const window = await chrome.windows.getLastFocused({ populate: true })
  if (!window.focused) {
    return false
  }
  return (
    window.tabs?.some(
      (tab) => tab.active && tab.url?.startsWith(chrome.runtime.getURL('workspace.html'))
    ) ?? false
  )
}

function browserPlatform(): NodeJS.Platform {
  const userAgent = navigator.userAgent.toLowerCase()
  return userAgent.includes('mac') ? 'darwin' : userAgent.includes('win') ? 'win32' : 'linux'
}
