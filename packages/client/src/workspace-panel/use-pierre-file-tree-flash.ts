import type { FileTree } from '@pierre/trees'
import { useLayoutEffect } from 'react'

import type { PierreFileTreeData } from './file-explorer/pierre-file-tree-data'

export function usePierreFileTreeFlash({
  flashingPath,
  model,
  treeData
}: {
  flashingPath: string | null
  model: FileTree
  treeData: PierreFileTreeData
}): void {
  useLayoutEffect(() => {
    const shadowRoot = model.getFileTreeContainer()?.shadowRoot
    if (!shadowRoot) {
      return
    }
    const clearMarker = (): void => {
      shadowRoot
        .querySelector('[data-agentstart-flashing="true"]')
        ?.removeAttribute('data-agentstart-flashing')
    }
    clearMarker()
    const canonicalPath = flashingPath
      ? treeData.canonicalPathByAbsolutePath.get(flashingPath)
      : null
    // Why: with no flash pending there is nothing to keep in sync, and an
    // always-on observer would run this on every row mount for the whole
    // session — the tree mutates constantly while scrolling.
    if (!canonicalPath) {
      return
    }

    const markRow = (): void => {
      clearMarker()
      for (const row of shadowRoot.querySelectorAll<HTMLElement>('[data-type="item"]')) {
        if (row.dataset.itemPath === canonicalPath) {
          row.dataset.agentstartFlashing = 'true'
          break
        }
      }
    }
    markRow()
    // Why: reveal can scroll a virtual row into the Shadow DOM after React's
    // effect runs, so keep the marker in sync with row mount/unmount changes.
    const observer = new MutationObserver(markRow)
    observer.observe(shadowRoot, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      clearMarker()
    }
  }, [flashingPath, model, treeData.canonicalPathByAbsolutePath])
}
