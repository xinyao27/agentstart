import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { agentPhaseLabel } from '~renderer/agent-session/phase'
import { useAgentPresence } from '~renderer/agent-session/presence'
import { translate } from '~renderer/i18n/i18n'
import faviconImage from '~renderer/public/favicon.png?inline'
import { openRuntimeTerminalClient } from '~renderer/runtime/terminal-protocol'

import { getExtensionBrowserCapabilities } from '../browser-capabilities'
import { getExtensionHostNavigation } from '../navigation'
import { terminalsQuery } from '../runtime/queries'
import { confirmDangerousOperation } from '../security/passkey'

export function AgentPresence(): null {
  const terminals = useQuery(terminalsQuery)
  const projectId = new URLSearchParams(window.location.search).get('project')
  const presence = useAgentPresence(projectId)
  const phase = presence.phase
  const activeCount = presence.active.length
  const activeProjectIds = [...new Set(presence.active.map((entry) => entry.projectId))]
  const activeTerminalHandles = presence.active.flatMap((entry) =>
    entry.terminal ? [entry.terminal] : []
  )
  const activeTerminalKey = activeTerminalHandles.join('\0')
  const activeProjectKey = activeProjectIds.join('\0')
  const waitingCount = presence.waiting.length
  const waiting = presence.waiting.flatMap((entry) =>
    entry.terminal
      ? [
          {
            projectId: entry.projectId,
            terminal: entry.terminal,
            title: entry.title ?? translate('extension.agent.untitled', 'Agent'),
            worktreeId: entry.worktreeId
          }
        ]
      : []
  )
  useEffect(() => {
    const capabilities = getExtensionBrowserCapabilities()
    const navigation = getExtensionHostNavigation()
    const previousTitle = document.title
    navigation.publishAgentAttention(waitingCount)
    const publishPresence = (): void => {
      void capabilities.publishAgentPresence({
        activeCount,
        activeProjectIds: activeProjectKey ? activeProjectKey.split('\0') : [],
        activeTerminalHandles: activeTerminalKey ? activeTerminalKey.split('\0') : [],
        phase,
        waiting
      })
    }
    publishPresence()
    const heartbeat = window.setInterval(publishPresence, 15_000)
    document.title = phase
      ? `${agentPhaseLabel(phase)} · ${translate('extension.productName', 'AgentStart')}`
      : translate('extension.productName', 'AgentStart')
    const existingFavicon = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]')
    const favicon =
      phase === 'waiting-decision' ? (existingFavicon ?? createFavicon()) : existingFavicon
    const previousFavicon = existingFavicon?.getAttribute('href') ?? null
    if (phase === 'waiting-decision' && favicon) {
      favicon.href = attentionFaviconDataUrl()
    }
    return () => {
      window.clearInterval(heartbeat)
      document.title = previousTitle
      if (!favicon || phase !== 'waiting-decision') {
        return
      }
      if (previousFavicon === null) {
        favicon.remove()
      } else {
        favicon.setAttribute('href', previousFavicon)
      }
    }
  }, [activeCount, activeProjectKey, activeTerminalKey, phase, waiting, waitingCount])
  useEffect(() => {
    const capabilities = getExtensionBrowserCapabilities()
    void capabilities.consumePendingAgentApproval().then(async (terminal) => {
      if (terminal) {
        await confirmDangerousOperation(`terminal.approve:${terminal}`)
        await (await openRuntimeTerminalClient({ kind: 'local' })).approve(terminal)
      }
    })
  }, [terminals.dataUpdatedAt])
  return null
}

function createFavicon(): HTMLLinkElement {
  const favicon = document.createElement('link')
  favicon.rel = 'icon'
  document.head.append(favicon)
  return favicon
}

function attentionFaviconDataUrl(): string {
  const attentionColor =
    getComputedStyle(document.documentElement).getPropertyValue('--color-amber-500').trim() ||
    'currentColor'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><image href="${faviconImage}" width="32" height="32"/><circle cx="26" cy="6" r="6" fill="${attentionColor}"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
