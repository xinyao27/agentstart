import { translate } from '../i18n/translate'
import {
  acceptAgentPresence,
  type AgentNotificationTarget,
  type AgentPresenceInput,
  forgetAgentPresence,
  parseAgentPresence,
  parseStringList,
  presenceSource
} from './agent-presence-state'
import { updateProjectGroupActivity } from './project-groups'
import { focusOrCreatePage, focusOrCreateWorkspace } from './workspace-navigation'

const AGENT_NOTIFICATION_PREFIX = 'agentstart-agent:'
const AWAY_DIGEST_NOTIFICATION_ID = 'agentstart-away-digest'
let hasRegisteredIdleListener = false
let hasRegisteredNotificationListeners = false
let hasRegisteredTabListener = false

export function handleAgentPresenceMessage(
  message: object,
  sender: chrome.runtime.MessageSender
): boolean | null {
  if (Reflect.get(message, 'type') !== 'agent-presence') {
    return null
  }
  const presence = parseAgentPresence(message)
  const source = presenceSource(sender)
  if (!presence || !source) {
    return false
  }
  acceptAgentPresence(source, presence, applyPresence)
  return false
}

export function handleOperationProgressMessage(message: object): boolean | null {
  if (Reflect.get(message, 'type') !== 'operation-progress') {
    return null
  }
  const id = Reflect.get(message, 'id')
  const detail = Reflect.get(message, 'message')
  const progress = Reflect.get(message, 'progress')
  const title = Reflect.get(message, 'title')
  if (
    typeof id !== 'string' ||
    typeof detail !== 'string' ||
    typeof title !== 'string' ||
    typeof progress !== 'number' ||
    !Number.isInteger(progress) ||
    progress < 0 ||
    progress > 100
  ) {
    return false
  }
  void publishProgress({ detail, id, progress, title })
  return true
}

export function registerAgentPresenceListeners(): void {
  if (!hasRegisteredTabListener) {
    hasRegisteredTabListener = true
    chrome.tabs.onRemoved.addListener((tabId) => {
      forgetAgentPresence(`tab:${tabId}`, applyPresence)
    })
  }
  if (chrome.notifications && !hasRegisteredNotificationListeners) {
    hasRegisteredNotificationListeners = true
    chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
      if (notificationId === AWAY_DIGEST_NOTIFICATION_ID) {
        void focusOrCreatePage('activity')
        return
      }
      if (!notificationId.startsWith(AGENT_NOTIFICATION_PREFIX)) {
        return
      }
      void readNotificationTarget(notificationId).then(async (target) => {
        if (!target) {
          await focusOrCreatePage('activity')
          return
        }
        if (buttonIndex === 0) {
          await chrome.storage.session.set({ pendingAgentApproval: target.terminal })
        }
        await focusOrCreateWorkspace({
          projectId: target.projectId,
          sessionId: target.terminal,
          worktreeId: target.worktreeId
        })
      })
    })

    chrome.notifications.onClicked.addListener((notificationId) => {
      if (notificationId === AWAY_DIGEST_NOTIFICATION_ID) {
        void focusOrCreatePage('activity')
        return
      }
      if (notificationId.startsWith(AGENT_NOTIFICATION_PREFIX)) {
        void readNotificationTarget(notificationId).then((target) =>
          target
            ? focusOrCreateWorkspace({
                projectId: target.projectId,
                sessionId: target.terminal,
                worktreeId: target.worktreeId
              })
            : focusOrCreatePage('activity')
        )
      }
    })
  }

  if (chrome.idle && !hasRegisteredIdleListener) {
    hasRegisteredIdleListener = true
    chrome.idle.onStateChanged.addListener((state) => {
      if (state === 'active') {
        void publishAwayDigest()
      }
    })
  }
}

async function applyPresence(input: AgentPresenceInput): Promise<void> {
  await Promise.all([
    updateKeepAwake(input.activeCount),
    updateAgentProjectGroups(input.activeProjectIds),
    updateAttentionBadge(input.waiting.length)
  ])
  if (!(await chrome.permissions.contains({ permissions: ['notifications'] }))) {
    return
  }
  const idleState = (await chrome.permissions.contains({ permissions: ['idle'] }))
    ? await chrome.idle.queryState(60)
    : 'active'
  if (idleState !== 'active') {
    await chrome.storage.session.set({ awayAgentTargets: input.waiting })
    await clearAgentNotifications()
    return
  }
  const targetsByProject = new Map<string, AgentNotificationTarget[]>()
  for (const target of input.waiting) {
    targetsByProject.set(target.projectId, [
      ...(targetsByProject.get(target.projectId) ?? []),
      target
    ])
  }
  await clearAgentNotifications(new Set(targetsByProject.keys()))
  await chrome.storage.session.set({ notificationTargets: input.waiting })
  await Promise.all(
    [...targetsByProject].map(([projectId, targets]) =>
      chrome.notifications.create(`${AGENT_NOTIFICATION_PREFIX}${projectId}`, {
        buttons: [
          { title: translate('allowAgentOnce', 'Allow once') },
          { title: translate('viewAgent', 'View') }
        ],
        iconUrl: chrome.runtime.getURL('icon.png'),
        message: translate('agentsWaitingInProject', '{{count}} agent(s) waiting in this project', {
          count: targets.length
        }),
        priority: 2,
        title: translate('attentionRequired', 'AgentStart needs your decision'),
        type: 'basic'
      })
    )
  )
}

async function updateAttentionBadge(waitingCount: number): Promise<void> {
  await Promise.all([
    chrome.action.setBadgeBackgroundColor({ color: '#d97706' }),
    chrome.action.setBadgeText({ text: waitingCount > 0 ? String(waitingCount) : '' })
  ])
}

async function updateAgentProjectGroups(activeProjectIds: string[]): Promise<void> {
  const stored: unknown = await chrome.storage.session.get('activeAgentProjectIds')
  const previous =
    typeof stored === 'object' && stored !== null
      ? parseStringList(Reflect.get(stored, 'activeAgentProjectIds'))
      : null
  await chrome.storage.session.set({ activeAgentProjectIds: activeProjectIds })
  if (!previous) {
    return
  }
  const active = new Set(activeProjectIds)
  const becameIdle = new Set(previous.filter((projectId) => !active.has(projectId)))
  const becameActive = new Set(
    activeProjectIds.filter((projectId) => !previous.includes(projectId))
  )
  if (becameIdle.size === 0 && becameActive.size === 0) {
    return
  }
  await updateProjectGroupActivity(previous, activeProjectIds)
}

async function updateKeepAwake(activeCount: number): Promise<void> {
  if (!(await chrome.permissions.contains({ permissions: ['power'] }))) {
    return
  }
  if (activeCount > 0) {
    chrome.power.requestKeepAwake('system')
  } else {
    chrome.power.releaseKeepAwake()
  }
}

async function publishProgress(input: {
  detail: string
  id: string
  progress: number
  title: string
}): Promise<void> {
  if (!(await chrome.permissions.contains({ permissions: ['notifications'] }))) {
    return
  }
  await chrome.notifications.create(`agentstart-progress:${input.id}`, {
    iconUrl: chrome.runtime.getURL('icon.png'),
    message: input.detail,
    progress: input.progress,
    title: input.title,
    type: 'progress'
  })
  if (input.progress === 100) {
    setTimeout(() => {
      void chrome.notifications.clear(`agentstart-progress:${input.id}`)
    }, 4_000)
  }
}

async function clearAgentNotifications(keep = new Set<string>()): Promise<void> {
  const current = await chrome.notifications.getAll()
  await Promise.all(
    Object.keys(current).flatMap((id) => {
      const projectId = id.startsWith(AGENT_NOTIFICATION_PREFIX)
        ? id.slice(AGENT_NOTIFICATION_PREFIX.length)
        : null
      return projectId && !keep.has(projectId) ? [chrome.notifications.clear(id)] : []
    })
  )
}

async function publishAwayDigest(): Promise<void> {
  const stored: unknown = await chrome.storage.session.get('awayAgentTargets')
  const targets =
    typeof stored === 'object' && stored !== null
      ? parseTargets(Reflect.get(stored, 'awayAgentTargets'))
      : null
  if (!targets || targets.length === 0) {
    return
  }
  await chrome.storage.session.remove('awayAgentTargets')
  await chrome.notifications.create(AWAY_DIGEST_NOTIFICATION_ID, {
    buttons: [{ title: translate('viewActivity', 'View Activity') }],
    iconUrl: chrome.runtime.getURL('icon.png'),
    message: translate(
      'awayDigestMessage',
      '{{count}} agent(s) need your attention after you left',
      {
        count: targets.length
      }
    ),
    priority: 1,
    title: translate('awayDigestTitle', 'While you were away'),
    type: 'basic'
  })
}

async function readNotificationTarget(
  notificationId: string
): Promise<AgentNotificationTarget | null> {
  const stored: unknown = await chrome.storage.session.get('notificationTargets')
  const targets =
    typeof stored === 'object' && stored !== null
      ? parseTargets(Reflect.get(stored, 'notificationTargets'))
      : null
  const projectId = notificationId.slice(AGENT_NOTIFICATION_PREFIX.length)
  return targets?.find((target) => target.projectId === projectId) ?? null
}

function parseTargets(value: unknown): AgentNotificationTarget[] | null {
  const parsed = parseAgentPresence({
    activeCount: 0,
    activeProjectIds: [],
    activeTerminalHandles: [],
    phase: null,
    waiting: value
  })
  return parsed?.waiting ?? null
}
