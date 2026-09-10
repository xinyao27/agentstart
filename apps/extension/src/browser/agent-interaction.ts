import type { AgentPhase } from '@agentstart/protocol/agent/phase'

import { translate } from '../i18n/translate'

let monitorBody: HTMLElement | null = null
let monitorWindow: Window | null = null

export async function prepareLongRunningAgent(): Promise<void> {
  await chrome.permissions.request({ permissions: ['idle', 'notifications', 'power'] })
}

export async function publishAgentPresence(input: {
  activeCount: number
  activeProjectIds: string[]
  activeTerminalHandles: string[]
  phase: AgentPhase | null
  waiting: {
    projectId: string
    terminal: string
    title: string
    worktreeId: string
  }[]
}): Promise<void> {
  await chrome.runtime.sendMessage({ ...input, type: 'agent-presence' })
  updateAgentMonitor(input)
}

export async function openAgentMonitor(input: { body: string; title: string }): Promise<void> {
  if (monitorWindow && !monitorWindow.closed && monitorBody) {
    monitorWindow.document.title = input.title
    monitorBody.textContent = input.body
    monitorWindow.focus()
    return
  }
  const pictureInPicture = Reflect.get(globalThis, 'documentPictureInPicture')
  const requestWindow =
    typeof pictureInPicture === 'object' && pictureInPicture !== null
      ? Reflect.get(pictureInPicture, 'requestWindow')
      : null
  if (typeof requestWindow !== 'function') {
    throw new Error('document_picture_in_picture_unavailable')
  }
  const monitor: unknown = await Reflect.apply(requestWindow, pictureInPicture, [
    { height: 320, width: 480 }
  ])
  if (!isMonitorWindow(monitor)) {
    throw new Error('document_picture_in_picture_failed')
  }
  monitor.document.title = input.title
  const style = monitor.document.createElement('style')
  style.textContent =
    'html{color-scheme:light dark}body{margin:0;padding:16px;background:Canvas;color:CanvasText;font:13px ui-monospace,monospace}h1{font:600 14px system-ui;margin:0 0 12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}'
  const title = monitor.document.createElement('h1')
  title.textContent = input.title
  const body = monitor.document.createElement('pre')
  body.textContent = input.body
  monitor.document.head.append(style)
  monitor.document.body.append(title, body)
  monitorBody = body
  monitorWindow = monitor
  monitor.addEventListener('pagehide', () => {
    monitorBody = null
    monitorWindow = null
  })
}

function isMonitorWindow(value: unknown): value is Window {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const document = Reflect.get(value, 'document')
  return (
    typeof Reflect.get(value, 'focus') === 'function' &&
    typeof document === 'object' &&
    document !== null &&
    typeof Reflect.get(document, 'createElement') === 'function'
  )
}

function updateAgentMonitor(input: { activeCount: number; phase: AgentPhase | null }): void {
  if (!monitorBody || !monitorWindow || monitorWindow.closed) {
    return
  }
  const phase = input.phase ? agentPhaseLabel(input.phase) : translate('agentsIdle', 'Idle')
  monitorBody.textContent = translate(
    'agentMonitorStatus',
    '{{count}} active agent(s)\nStatus: {{phase}}',
    { count: input.activeCount, phase }
  )
}

function agentPhaseLabel(phase: AgentPhase): string {
  switch (phase) {
    case 'thinking':
      return translate('agentThinking', 'Thinking')
    case 'executing':
      return translate('agentExecuting', 'Executing')
    case 'waiting-decision':
      return translate('agentWaiting', 'Waiting for you')
    case 'complete':
      return translate('agentComplete', 'Complete')
  }
}
