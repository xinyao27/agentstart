import type { TopLevelView } from '@agentstart/protocol/settings/ui-state'
import type { TabContentType } from '@agentstart/protocol/workspace/tabs'
import { translate } from '~renderer/i18n/i18n'

// Why: top-level pages share the workspace titlebar as closeable tabs backed by
// real unified Tab records; this names that closed set of views so the store,
// the tab record, and the strip agree on it. Every view the titlebar can show
// besides the workspace body is in here — there is no page-shaped surface
// without a tab.
export type WorkspacePageView = Extract<
  TopLevelView,
  'home' | 'skills' | 'settings' | 'mobile' | 'space'
>

export function isWorkspacePageView(view: TopLevelView): view is WorkspacePageView {
  switch (view) {
    case 'home':
    case 'skills':
    case 'settings':
    case 'mobile':
    case 'space':
      return true
    case 'terminal':
      return false
  }
}

// Why: a page tab's id is deterministic (`page:<view>`) so reopening a page
// focuses the existing tab instead of stacking duplicates. It is a real
// unified Tab id now, not a synthetic entry with no backing record.
export const PAGE_TAB_ID_PREFIX = 'page:'

export function pageTabId(view: WorkspacePageView): string {
  return `${PAGE_TAB_ID_PREFIX}${view}`
}

export function isPageTabId(id: string): boolean {
  return id.startsWith(PAGE_TAB_ID_PREFIX)
}

export function pageTabViewFromId(id: string): WorkspacePageView | null {
  if (!isPageTabId(id)) {
    return null
  }
  return asWorkspacePageView(id.slice(PAGE_TAB_ID_PREFIX.length))
}

function asWorkspacePageView(value: string): WorkspacePageView | null {
  switch (value) {
    case 'home':
      return 'home'
    case 'skills':
      return 'skills'
    case 'settings':
      return 'settings'
    case 'mobile':
      return 'mobile'
    case 'space':
      return 'space'
    default:
      return null
  }
}

// Why: the view a page tab shows is its entity, so any unified Tab can be
// classified without consulting the id scheme.
export function pageViewFromTab(tab: {
  contentType: TabContentType
  entityId: string
}): WorkspacePageView | null {
  return tab.contentType === 'page' ? asWorkspacePageView(tab.entityId) : null
}

// Why: labels reuse the sidebar navigation strings so a rename never forks
// between the rail and the titlebar tab for the same surface. Kept here rather
// than beside the tab component because the store needs it when creating the
// tab record, and the state layer must not import React.
const PAGE_TAB_LABELS: Record<WorkspacePageView, { labelKey: string; fallbackLabel: string }> = {
  home: {
    labelKey: 'auto.components.sidebar.SidebarNav.activity',
    fallbackLabel: 'Activity'
  },
  mobile: {
    labelKey: 'auto.components.sidebar.SidebarNav.1b5c41caee',
    fallbackLabel: 'AgentStart Mobile'
  },
  settings: {
    labelKey: 'auto.components.sidebar.SidebarNav.settings',
    fallbackLabel: 'Settings'
  },
  skills: {
    labelKey: 'auto.components.sidebar.SidebarNav.skills',
    fallbackLabel: 'Skills'
  },
  space: {
    labelKey: 'auto.components.workspace.space.WorkspaceSpacePage.45f6302dbc',
    fallbackLabel: 'Space'
  }
}

export function resolvePageTabLabel(view: WorkspacePageView): string {
  const { labelKey, fallbackLabel } = PAGE_TAB_LABELS[view]
  return translate(labelKey, fallbackLabel)
}
