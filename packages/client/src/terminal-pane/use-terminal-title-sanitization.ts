import type { TerminalLayoutSnapshot } from '@yiru/protocol/workspace/session'
import type { TerminalTab } from '@yiru/protocol/workspace/tabs'
import { useEffect } from 'react'

import type { PaneManager } from './pane-manager/pane-manager'
import { isSyntheticSinglePaneTitle, sanitizeTerminalLayoutPaneTitles } from './title-sanitization'

type TerminalTitleSanitizationInput = {
  managerRef: React.RefObject<PaneManager | null>
  paneCount: number
  paneTitles: Record<number, string>
  paneTitlesRef: React.RefObject<Record<number, string>>
  persistLayoutSnapshot: () => void
  savedLayout: TerminalLayoutSnapshot
  setPaneTitles: React.Dispatch<React.SetStateAction<Record<number, string>>>
  setTabLayout: (tabId: string, layout: TerminalLayoutSnapshot) => void
  tab: TerminalTab | null
  tabId: string
}

export function useTerminalTitleSanitization({
  managerRef,
  paneCount,
  paneTitles,
  paneTitlesRef,
  persistLayoutSnapshot,
  savedLayout,
  setPaneTitles,
  setTabLayout,
  tab,
  tabId
}: TerminalTitleSanitizationInput): void {
  useEffect(() => {
    if (!tab) {
      return
    }
    const sanitized = sanitizeTerminalLayoutPaneTitles(savedLayout, tab)
    if (sanitized !== savedLayout) {
      setTabLayout(tabId, sanitized)
    }
  }, [savedLayout, setTabLayout, tab, tabId])

  useEffect(() => {
    const panes = managerRef.current?.getPanes()
    if (!tab || panes?.length !== 1) {
      return
    }
    const paneId = panes[0].id
    const currentTitle = paneTitlesRef.current[paneId]
    if (!currentTitle || !isSyntheticSinglePaneTitle(currentTitle, tab)) {
      return
    }
    const nextTitles = { ...paneTitlesRef.current }
    delete nextTitles[paneId]
    paneTitlesRef.current = nextTitles
    setPaneTitles((current) => {
      if (!current[paneId] || !isSyntheticSinglePaneTitle(current[paneId], tab)) {
        return current
      }
      const next = { ...current }
      delete next[paneId]
      return next
    })
    persistLayoutSnapshot()
  }, [managerRef, paneCount, paneTitles, paneTitlesRef, persistLayoutSnapshot, setPaneTitles, tab])
}
