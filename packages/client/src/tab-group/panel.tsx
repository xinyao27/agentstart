import { useDroppable } from '@dnd-kit/core'
import { Suspense } from 'react'
import { createPortal } from 'react-dom'
import { lazyWithRetry as lazy } from '~renderer/application-shell/lazy-with-retry'
import { useWorkspaceSharedHeaderTarget } from '~renderer/application-shell/workspace-shared-header'
import { BrowserTabProjectionPane } from '~renderer/browser-tab-projection/pane'
import { translate } from '~renderer/i18n/i18n'
import { X } from '~renderer/icons/hugeicons'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { TabBarOpenInMenuButton } from '../tab-bar/open-in-menu-button'
import { TabBarQuickCommandsButton } from '../tab-bar/quick-commands-button'
import TabBar from '../tab-bar/tab-bar'
import { TabSurfaceProvider } from '../tab-bar/tab-surfaces'
import { closeTerminalTab } from '../terminal/tab-actions'
import { WorkspacePanelContent } from '../workspace-panel/workspace-panel-content'
import { WorkspaceToolTabs } from '../workspace-panel/workspace-tool-tabs'
import { tabGroupBodyAnchorName } from './body-anchor'
import { getTabPaneBodyDroppableId, type HoveredTabInsertion } from './use-tab-drag-split'
import { useTabGroupWorkspaceModel } from './use-tab-group-workspace-model'
import { resolveGroupTabFromVisibleId } from './visible-id'
import { WorkspacePaneFrame, WorkspacePaneFrameHeader } from './workspace-pane-frame'

const EditorPanel = lazy(() => import('../editor/panel'))
const GitGraphView = lazy(() => import('../workspace-panel/git-graph/view'))

export default function TabGroupPanel({
  groupId,
  worktreeId,
  isFocused,
  hasSplitGroups,
  touchesRightEdge,
  touchesLeftEdge,
  touchesBottomEdge = false,
  suppressLeftBorder = false,
  suppressRightBorder = false,
  suppressBottomBorder = false,
  useSharedHeader = false,
  isSharedStripGroup = false,
  isTabDragActive = false,
  hoveredTabInsertion = null
}: {
  groupId: string
  worktreeId: string
  isFocused: boolean
  hasSplitGroups: boolean
  touchesRightEdge: boolean
  touchesLeftEdge: boolean
  touchesBottomEdge?: boolean
  suppressLeftBorder?: boolean
  suppressRightBorder?: boolean
  suppressBottomBorder?: boolean
  useSharedHeader?: boolean
  isSharedStripGroup?: boolean
  isTabDragActive?: boolean
  hoveredTabInsertion?: HoveredTabInsertion | null
}): React.JSX.Element {
  const model = useTabGroupWorkspaceModel({ groupId, worktreeId })
  const { activeTab, browserItems, commands, editorItems, tabBarOrder, terminalTabs } = model
  const sharedHeaderTarget = useWorkspaceSharedHeaderTarget()
  const workspacePanelOpen = useAppStore((state) => state.workspacePanelOpen)
  const workspacePanelTab = useAppStore((state) => state.workspacePanelTab)
  const workspacePanelVisible = isFocused && workspacePanelOpen
  const activeGitGraphTabId = activeTab?.contentType === 'git-graph' ? activeTab.id : null
  const { setNodeRef: setBodyDropRef } = useDroppable({
    id: getTabPaneBodyDroppableId(groupId),
    data: {
      kind: 'pane-body',
      groupId,
      worktreeId
    },
    disabled: !isTabDragActive
  })
  // Why: terminal and simulator panes render once at the worktree level and
  // position over their owning group. Moving them between groups must not
  // remount xterm or reset a live simulator stream.
  const bodyAnchorName = tabGroupBodyAnchorName(groupId)
  // Why: memoize the style object so the literal isn't recreated on every
  // render. A fresh object every render would make the body `<div>` appear
  // to have a new `style` prop on every parent re-render, which defeats any
  // downstream memoization keyed on referential equality.
  const bodyAnchorStyle = (() => ({ anchorName: bodyAnchorName }) as React.CSSProperties)()

  const tabBar = (
    // Why: the tool island sits flush against the strip — the strip's own 12px
    // leading gutter is the whole separation, so a selected first tab's outer
    // arc lands inside it instead of behind an extra gap.
    <div className="flex h-full min-w-0 items-stretch">
      <WorkspaceToolTabs scope={{ groupId, worktreeId }} isFocused={isFocused} />
      <div className="min-w-0 flex-1">
        <TabBar
          tabs={terminalTabs}
          activeTabId={activeTab?.contentType === 'terminal' ? activeTab.entityId : null}
          groupId={groupId}
          worktreeId={worktreeId}
          expandedPaneByTabId={model.expandedPaneByTabId}
          onActivate={commands.activateTerminal}
          onClose={(terminalId) => {
            const item = resolveGroupTabFromVisibleId(model.groupTabs, terminalId)
            if (item?.contentType === 'terminal') {
              commands.closeItem(item.id)
              return
            }
            // Why: agent quick-launch can briefly desync unified/runtime tab ids
            // before the host snapshot lands; still route close through the shared
            // terminal close helper instead of no-op'ing.
            closeTerminalTab(terminalId)
          }}
          onCloseOthers={(visibleId) => {
            // Why: TabBar emits this with the entityId for terminals/browsers and
            // the unifiedTabId for editors (see TabBar's per-type wiring). Match
            // both so the menu works on every tab kind, not just terminals.
            const item = resolveGroupTabFromVisibleId(model.groupTabs, visibleId)
            if (item) {
              commands.closeOthers(item.id)
            }
          }}
          onCloseToRight={(visibleId) => {
            const item = resolveGroupTabFromVisibleId(model.groupTabs, visibleId)
            if (item) {
              commands.closeToRight(item.id)
            }
          }}
          onNewTerminalTab={commands.newTerminalTab}
          onNewTerminalWithShell={commands.newTerminalWithShell}
          onNewBrowserTab={commands.newBrowserTab}
          onNewSimulatorTab={commands.newSimulatorTab}
          onOpenEntry={commands.openEntry}
          onNewFileTab={commands.newFileTab}
          onSetCustomTitle={commands.setTabCustomTitle}
          onSetTabColor={commands.setTabColor}
          onTogglePaneExpand={commands.toggleTerminalPaneExpand}
          editorFiles={editorItems}
          browserTabs={browserItems}
          activeFileId={
            !activeTab ||
            activeTab.contentType === 'terminal' ||
            activeTab.contentType === 'browser' ||
            activeTab.contentType === 'simulator' ||
            activeTab.contentType === 'git-graph' ||
            // Why: a page tab has no backing editor document; treating it as an
            // active file would make the editor pane try to open its view name.
            activeTab.contentType === 'page'
              ? null
              : activeTab.id
          }
          activeBrowserTabId={activeTab?.contentType === 'browser' ? activeTab.entityId : null}
          activeSimulatorTabId={activeTab?.contentType === 'simulator' ? activeTab.id : null}
          activeGitGraphTabId={activeGitGraphTabId}
          activeTabType={
            activeTab?.contentType === 'terminal'
              ? 'terminal'
              : activeTab?.contentType === 'browser'
                ? 'browser'
                : activeTab?.contentType === 'simulator'
                  ? 'simulator'
                  : 'editor'
          }
          onActivateFile={commands.activateEditor}
          onCloseFile={commands.closeItem}
          onActivateBrowserTab={commands.activateBrowser}
          onActivateGitGraphTab={commands.activateGitGraph}
          onCloseBrowserTab={(browserTabId) => {
            const item = model.groupTabs.find(
              (candidate) =>
                candidate.entityId === browserTabId && candidate.contentType === 'browser'
            )
            if (item) {
              commands.closeItem(item.id)
            }
          }}
          onDuplicateBrowserTab={commands.duplicateBrowserTab}
          onCloseAllFiles={commands.closeAllEditorTabsInGroup}
          onMakePreviewFilePermanent={(_fileId, tabId) => {
            if (!tabId) {
              return
            }
            const item = model.groupTabs.find((candidate) => candidate.id === tabId)
            if (!item) {
              return
            }
            commands.makePreviewFilePermanent(item.entityId, item.id)
          }}
          onPinFile={(_fileId, tabId) => {
            if (!tabId) {
              return
            }
            const item = model.groupTabs.find((candidate) => candidate.id === tabId)
            if (!item) {
              return
            }
            commands.pinFile(item.entityId, item.id)
          }}
          tabBarOrder={tabBarOrder}
          hoveredTabInsertion={hoveredTabInsertion}
        />
      </div>
    </div>
  )

  // Why: pane-specific actions stay with the focused split. WorkspacePaneFrame
  // owns edge chrome because its side changes between native and extension hosts.
  const focusedActionChromeClassName = cn(
    'shrink-0 overflow-hidden transition-[opacity] duration-150',
    isFocused ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0 w-0'
  )
  // Why: the split wrapper already paints edge-touching seams; duplicating them
  // inside a pane makes the workspace boundary look two pixels wide.
  const splitFrameClassName = hasSplitGroups
    ? cn(
        !(touchesLeftEdge || suppressLeftBorder) && 'border-l',
        !(touchesRightEdge || suppressRightBorder) && 'border-r',
        !(touchesBottomEdge || suppressBottomBorder) && 'border-b',
        'border-border',
        isFocused && !touchesBottomEdge && !suppressBottomBorder && 'border-b-accent',
        !isFocused && 'opacity-95'
      )
    : undefined
  const trailingActions = (
    <>
      {isFocused ? (
        <div className={cn(focusedActionChromeClassName, 'flex items-center gap-0.5')}>
          <TabBarOpenInMenuButton worktreeId={worktreeId} />
          <TabBarQuickCommandsButton
            worktreeId={worktreeId}
            groupId={groupId}
            presentation="titlebar-icon"
          />
          {hasSplitGroups ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={translate(
                      'auto.components.tab.group.TabGroupPanel.closePaneColumn',
                      'Close split pane'
                    )}
                    onClick={(event) => {
                      event.stopPropagation()
                      commands.closeGroup()
                    }}
                  >
                    <X />
                  </Button>
                }
              />
              <TooltipContent side="bottom" sideOffset={6}>
                {translate(
                  'auto.components.tab.group.TabGroupPanel.closePaneColumn',
                  'Close split pane'
                )}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      ) : (
        <div className={cn('h-full', focusedActionChromeClassName)} />
      )}
    </>
  )
  // Why: hide pane-local rows from the first shared-layout render so moving
  // the Header into the shell never changes the content area's height. Strip
  // ownership rides on isSharedStripGroup rather than isFocused: the focused
  // group keeps hosting the titlebar strip while a top-level page is open.
  // The plane scope rides on the portal itself — a portaled strip paints on
  // the chrome plane, while the same strip rendered in-frame sits on the
  // content card and keeps the recessed selected surface.
  const shouldUseSharedHeader = useSharedHeader
  const sharedHeader =
    shouldUseSharedHeader && isSharedStripGroup && sharedHeaderTarget
      ? createPortal(
          <TabSurfaceProvider scope="plane">
            <WorkspacePaneFrameHeader
              tabBar={tabBar}
              trailingActions={trailingActions}
              stripId={groupId}
              worktreeId={worktreeId}
            />
          </TabSurfaceProvider>,
          sharedHeaderTarget
        )
      : null

  return (
    <>
      {sharedHeader}
      <WorkspacePaneFrame
        worktreeId={worktreeId}
        stripId={groupId}
        tabBar={tabBar}
        hideHeader={shouldUseSharedHeader}
        trailingActions={trailingActions}
        rootClassName={splitFrameClassName}
        rootProps={{
          onPointerDown: commands.focusGroup,
          onFocusCapture: commands.focusGroup
        }}
        bodyRef={setBodyDropRef}
        bodyProps={{
          'data-tab-group-body-id': groupId,
          'data-worktree-id': worktreeId,
          style: bodyAnchorStyle
        }}
      >
        {/* Why: this empty anchor lets the agent-sessions tour read as a
          terminal-area tip instead of attaching to toolbar chrome. */}
        {isFocused ? (
          <div
            className="pointer-events-none absolute inset-x-0 top-1/4 h-px"
            data-contextual-tour-target="workspace-agent-terminal-tip"
          />
        ) : null}
        {workspacePanelVisible ? (
          <div className="absolute inset-0 flex min-h-0 min-w-0">
            <WorkspacePanelContent
              effectiveTab={workspacePanelTab}
              workspacePanelOpen={workspacePanelOpen}
              isVisible
              workspacePanelTabId={groupId}
            />
          </div>
        ) : null}
        {activeTab &&
          !workspacePanelVisible &&
          activeTab.contentType !== 'terminal' &&
          activeTab.contentType !== 'browser' &&
          activeTab.contentType !== 'simulator' &&
          activeTab.contentType !== 'git-graph' &&
          // Why: a page tab's content is the shell-level page surface, not an
          // editor document. Without this the editor pane would mount for it.
          activeTab.contentType !== 'page' && (
            <div className="absolute inset-0 flex min-h-0 min-w-0">
              {/* Why: split groups render editor content inside a plain relative pane body
                instead of the legacy flex column in Terminal.tsx. */}
              <Suspense
                fallback={
                  <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
                    {translate(
                      'auto.components.tab.group.TabGroupPanel.814fb04c43',
                      'Loading editor...'
                    )}
                  </div>
                }
              >
                <EditorPanel activeFileId={activeTab.entityId} activeViewStateId={activeTab.id} />
              </Suspense>
            </div>
          )}

        {!workspacePanelVisible && activeTab?.contentType === 'git-graph' ? (
          <div className="absolute inset-0 flex min-h-0 min-w-0">
            <Suspense fallback={null}>
              <GitGraphView worktreeId={worktreeId} tabId={activeTab.id} />
            </Suspense>
          </div>
        ) : null}

        {!workspacePanelVisible && activeTab?.contentType === 'browser' ? (
          <div className="absolute inset-0 flex min-h-0 min-w-0">
            <BrowserTabProjectionPane workspaceId={activeTab.entityId} worktreeId={worktreeId} />
          </div>
        ) : null}

        {/* Why: terminal and simulator panes render at the worktree level so
          split moves do not remount xterm or reload the simulator stream. */}
      </WorkspacePaneFrame>
    </>
  )
}
