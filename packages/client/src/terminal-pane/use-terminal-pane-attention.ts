import { makePaneKey } from '@yiru/protocol/terminal/pane-identity'
import { useEffect, useLayoutEffect } from 'react'

import { useEventCallback } from '../react/use-event-callback'
import {
  applyTerminalPaneAttentionToManager,
  subscribeTerminalPaneAttention
} from './attention-subscriptions'
import type { PaneManager } from './pane-manager/pane-manager'

type TerminalPaneAttentionInput = {
  clearTerminalPaneUnread: (paneKey: string) => void
  clearTerminalTabUnread: (tabId: string) => void
  clearWorktreeUnread: (worktreeId: string) => void
  containerRef: React.RefObject<HTMLDivElement | null>
  managerRef: React.RefObject<PaneManager | null>
  paneCount: number
  tabId: string
  worktreeId: string
}

export function useTerminalPaneAttention({
  clearTerminalPaneUnread,
  clearTerminalTabUnread,
  clearWorktreeUnread,
  containerRef,
  managerRef,
  paneCount,
  tabId,
  worktreeId
}: TerminalPaneAttentionInput): void {
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const onPointerDown = (event: PointerEvent): void => {
      clearTerminalTabUnread(tabId)
      clearWorktreeUnread(worktreeId)
      const paneElement =
        event.target instanceof Element ? event.target.closest('.pane[data-leaf-id]') : null
      const leafId = paneElement?.getAttribute('data-leaf-id')
      if (leafId) {
        clearTerminalPaneUnread(makePaneKey(tabId, leafId))
      }
    }
    container.addEventListener('pointerdown', onPointerDown, { capture: true })
    return () => container.removeEventListener('pointerdown', onPointerDown, { capture: true })
  }, [
    clearTerminalPaneUnread,
    clearTerminalTabUnread,
    clearWorktreeUnread,
    containerRef,
    tabId,
    worktreeId
  ])

  const applyAttention = useEventCallback(() => {
    const manager = managerRef.current
    if (manager) {
      applyTerminalPaneAttentionToManager(manager, tabId)
    }
  })
  useLayoutEffect(() => {
    applyAttention()
    return subscribeTerminalPaneAttention(tabId, applyAttention)
  }, [applyAttention, paneCount, tabId])
}
