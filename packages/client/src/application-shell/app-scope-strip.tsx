import { useShallow } from 'zustand/react/shallow'
import {
  isPageTabId,
  isWorkspacePageView,
  pageTabId,
  pageTabViewFromId,
  type WorkspacePageView
} from '~renderer/application-shell/state/workspace-page-views'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store/state'
import { TabBarOpenInMenuButton } from '~renderer/tab-bar/open-in-menu-button'
import { AppScopePageTab } from '~renderer/tab-bar/page-tab'
import { TabBarQuickCommandsButton } from '~renderer/tab-bar/quick-commands-button'
import { WorkspaceTabCreateMenu } from '~renderer/tab-bar/workspace-tab-create-menu'
import { WorkspaceTabStripViewport } from '~renderer/tab-bar/workspace-tab-strip-viewport'
import { WorkspaceToolTabs } from '~renderer/workspace-panel/workspace-tool-tabs'

import { WorkspacePaneFrameHeader } from '../tab-group/workspace-pane-frame'
import { APP_SCOPE_WORKTREE_ID } from './state/app-scope'
import { activeViewFor } from './state/visible-surface'

/**
 * The strip the titlebar hosts while no workspace is open.
 *
 * Why it is a strip of its own rather than a fallback row beside the workspace
 * one: the titlebar's chrome — the left tool island and the right button group —
 * belongs to the strip, not to a workspace. Hosting the app scope's queue here
 * means those controls come from the same components, at the same geometry, and
 * through the same strip viewport as the workspace case, so the first tab never
 * shifts and the selected tab's merge silhouette always lands on the content
 * card's baseline. Everything a workspace would make actionable goes inert in
 * place instead of disappearing.
 *
 * The app scope's queue holds page tabs only — there is no terminal, editor, or
 * browser surface to create without a workspace — so the create menu and the
 * workspace actions render disabled with the reason in their tooltip.
 */
export function AppScopeStrip(): React.JSX.Element | null {
  const activeView = useAppStore((state) => activeViewFor(state))
  const showMobileButton = useAppStore((state) => state.settings?.showMobileButton !== false)
  const queuedPageIds = useAppStore(
    useShallow((state) => {
      const groupId = state.activeGroupIdByWorktree[APP_SCOPE_WORKTREE_ID]
      const group =
        groupId !== undefined
          ? (state.groupsByWorktree[APP_SCOPE_WORKTREE_ID] ?? []).find(
              (candidate) => candidate.id === groupId
            )
          : undefined
      return (group?.tabOrder ?? []).filter((id) => isPageTabId(id))
    })
  )
  // Why: the app scope's queue holds page tabs only, so the queued ids are the
  // views — and the active view is derived from that same queue, so it can no
  // longer name a page this scope has no tab for. The union that used to
  // compensate for a drifted persisted value is gone with the drift.
  const views = queuedPageIds
    .map((id) => pageTabViewFromId(id))
    .filter((view): view is WorkspacePageView => view !== null)
    // Why: the mobile page follows the same setting as the sidebar entry, so
    // hiding the mobile button also removes its tab.
    .filter((view) => view !== 'mobile' || showMobileButton)
  const activePageId =
    isWorkspacePageView(activeView) && views.includes(activeView) ? pageTabId(activeView) : null

  return (
    <WorkspacePaneFrameHeader
      tabBar={
        // Why: no extra gap beside the tool island — the strip's 12px leading
        // gutter is the separation, the same one a selected first tab's arc
        // flares into.
        <div className="flex h-full min-w-0 items-stretch">
          <WorkspaceToolTabs scope={null} />
          <div className="flex h-full min-w-0 flex-1 items-stretch overflow-hidden">
            <WorkspaceTabStripViewport
              activeTabId={activePageId}
              layoutKey={views.join('\u001f')}
              tabCount={views.length}
              navigationScopeId={APP_SCOPE_WORKTREE_ID}
              stripProps={{
                role: 'tablist',
                'aria-label': translate('auto.components.AppScopeStrip.label', 'Pages')
              }}
            >
              {views.map((view) => (
                <AppScopePageTab key={view} view={view} active={activeView === view} />
              ))}
            </WorkspaceTabStripViewport>
            <WorkspaceTabCreateMenu
              open={false}
              onOpenChange={() => {}}
              disabled
              disabledTooltip={translate(
                'auto.components.AppScopeStrip.requiresWorkspace',
                'Create a workspace first'
              )}
            >
              {null}
            </WorkspaceTabCreateMenu>
          </div>
        </div>
      }
      trailingActions={
        <>
          <TabBarOpenInMenuButton worktreeId={APP_SCOPE_WORKTREE_ID} disabled />
          <TabBarQuickCommandsButton
            worktreeId={APP_SCOPE_WORKTREE_ID}
            groupId={APP_SCOPE_WORKTREE_ID}
            presentation="titlebar-icon"
            disabled
          />
        </>
      }
    />
  )
}
