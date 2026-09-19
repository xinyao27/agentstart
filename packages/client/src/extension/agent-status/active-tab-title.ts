import { activeHostedTab } from '~renderer/application-shell/state/visible-surface'
import {
  pageViewFromTab,
  resolvePageTabLabel
} from '~renderer/application-shell/state/workspace-page-views'
import { getEditorDisplayLabel } from '~renderer/editor/labels'
import type { AppState } from '~renderer/store/types'
import { getBrowserTabLabel } from '~renderer/tab-bar/browser-tab'
import { resolveUnifiedTabLabel } from '~renderer/tab-title-resolution'

// Why: the browser tab is the only place the selected workbench tab shows
// outside the workbench, so it must follow the same label ladder the strip
// renders — the unified label alone misses editor files and browser URL
// fallbacks.
export function resolveActiveTabTitle(state: AppState): string | null {
  const tab = activeHostedTab(state)
  if (!tab) {
    return null
  }
  const generatedTitlesEnabled = state.settings?.tabAutoGenerateTitle === true
  switch (tab.contentType) {
    case 'terminal': {
      const terminal = (state.tabsByWorktree[tab.worktreeId] ?? []).find(
        (candidate) => candidate.id === tab.entityId
      )
      return toTitle(
        resolveUnifiedTabLabel(
          {
            ...tab,
            quickCommandLabel: tab.quickCommandLabel ?? terminal?.quickCommandLabel,
            generatedLabel: tab.generatedLabel ?? terminal?.generatedTitle
          },
          generatedTitlesEnabled
        )
      )
    }
    case 'browser': {
      const browser = (state.browserTabsByWorktree[tab.worktreeId] ?? []).find(
        (candidate) => candidate.id === tab.entityId
      )
      return toTitle(
        browser ? getBrowserTabLabel(browser) : resolveUnifiedTabLabel(tab, generatedTitlesEnabled)
      )
    }
    case 'editor':
    case 'diff':
    case 'conflict-review':
    case 'check-details': {
      const file = state.openFiles.find((candidate) => candidate.id === tab.entityId)
      return toTitle(
        file ? getEditorDisplayLabel(file) : resolveUnifiedTabLabel(tab, generatedTitlesEnabled)
      )
    }
    case 'page': {
      const view = pageViewFromTab(tab)
      return view
        ? resolvePageTabLabel(view)
        : toTitle(resolveUnifiedTabLabel(tab, generatedTitlesEnabled))
    }
    case 'simulator':
    case 'git-graph':
      return toTitle(resolveUnifiedTabLabel(tab, generatedTitlesEnabled))
  }
}

function toTitle(label: string): string | null {
  return label.trim() || null
}
