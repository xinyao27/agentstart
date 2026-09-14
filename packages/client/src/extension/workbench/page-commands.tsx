import { useEffect, useRef } from 'react'

import { useAppStore } from '../../store/state'
import { openCommandPalette } from '../command-palette/open'
import type { ExtensionPage, ExtensionPageSubscription } from '../navigation'

export function WorkbenchPageCommandBridge({
  subscribe
}: {
  subscribe: ExtensionPageSubscription
}): null {
  const isReady = useAppStore((state) => state.persistedUIReady && state.workspaceSessionReady)
  const pendingPagesRef = useRef<ExtensionPage[]>([])

  useEffect(
    () =>
      subscribe((page) => {
        pendingPagesRef.current.push(page)
        const state = useAppStore.getState()
        if (state.persistedUIReady && state.workspaceSessionReady) {
          flushPendingPages(pendingPagesRef.current)
        }
      }),
    [subscribe]
  )
  useEffect(() => {
    if (isReady) {
      flushPendingPages(pendingPagesRef.current)
    }
  }, [isReady])
  return null
}

export function openWorkbenchPage(page: ExtensionPage): void {
  const state = useAppStore.getState()
  switch (page) {
    case 'activity':
      state.openPageTab('home')
      return
    case 'mobile':
      state.openPageTab('mobile')
      return
    case 'search':
      openCommandPalette()
      return
    case 'settings':
      state.openSettingsPage()
      return
    case 'skills':
      state.openPageTab('skills')
  }
}

function flushPendingPages(pages: ExtensionPage[]): void {
  for (const page of pages.splice(0)) {
    openWorkbenchPage(page)
  }
}
