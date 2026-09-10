import type { TopLevelView } from '@agentstart/protocol/settings/ui-state'
import type { TerminalTab, WorkspaceVisibleTabType } from '@agentstart/protocol/workspace/tabs'
import React, { Suspense } from 'react'
import { lazyWithRetry as lazy } from '~renderer/application-shell/lazy-with-retry'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/ui/class-names'

import type { OpenFile } from '../editor/state'
import CodexRestartChip from '../terminal-pane/codex-restart/chip'
import { selectEvictionExemptTerminalTabIds } from '../terminal-pane/eviction-exempt-tabs'
import TerminalPane from '../terminal-pane/terminal-pane'
import { shouldMountBackgroundWorktreeTab } from '../terminal/background-terminal-worktree-mount'

const EditorPanel = lazy(() => import('../editor/panel'))

type WorkspaceSurface = { id: string; path: string }

type LegacyWorkspaceSurfacesProps = {
  workspaceSurfaces: WorkspaceSurface[]
  mountedWorktreeIds: ReadonlySet<string>
  measurableBackgroundWorktreeIds: ReadonlySet<string>
  parkedTerminalWorktreeIds: ReadonlySet<string>
  forceParkedTerminalWorktreeIds: ReadonlySet<string>
  backgroundMountTabIdsByWorktree: ReadonlyMap<string, ReadonlySet<string>>
  activeView: TopLevelView
  activeWorktreeId: string | null
  activeTabId: string | null
  activeTabType: WorkspaceVisibleTabType
  tabsByWorktree: Record<string, TerminalTab[]>
  worktreeFiles: OpenFile[]
  onPtyExit: (tabId: string, ptyId: string) => void
  onCloseTab: (tabId: string) => void
}

// Why: split-group layouts render their own terminal/editor surfaces
// through TabGroupPanel plus stable overlay layers. Keeping the legacy
// workspace-level panes mounted underneath as hidden DOM creates duplicate
// TerminalPane instances for the same tab, which lets two React trees race
// over one PTY — so the caller renders only one
// surface model at a time (see anyMountedWorktreeHasLayout in panel.tsx).
export function LegacyWorkspaceSurfaces({
  workspaceSurfaces,
  mountedWorktreeIds,
  measurableBackgroundWorktreeIds,
  parkedTerminalWorktreeIds,
  forceParkedTerminalWorktreeIds,
  backgroundMountTabIdsByWorktree,
  activeView,
  activeWorktreeId,
  activeTabId,
  activeTabType,
  tabsByWorktree,
  worktreeFiles,
  onPtyExit,
  onCloseTab
}: LegacyWorkspaceSurfacesProps): React.JSX.Element {
  return (
    <>
      {/* Terminal panes container - hidden when editor tab active */}
      <div
        className={cn(
          'relative flex-1 min-h-0 overflow-hidden',
          (activeTabType === 'editor' && worktreeFiles.length > 0) || activeTabType === 'simulator'
            ? 'hidden'
            : ''
        )}
      >
        {workspaceSurfaces
          .filter((workspace) => mountedWorktreeIds.has(workspace.id))
          .map((workspace) => {
            // Why: strict equality keeps preserved workspace surfaces hidden
            // behind every non-terminal top-level view.
            const isVisible = activeView === 'terminal' && workspace.id === activeWorktreeId
            const shouldMeasureHiddenWorktree =
              !isVisible && measurableBackgroundWorktreeIds.has(workspace.id)
            const shouldColdParkTerminalPanes =
              !isVisible &&
              !shouldMeasureHiddenWorktree &&
              parkedTerminalWorktreeIds.has(workspace.id)
            const terminalTabs = tabsByWorktree[workspace.id] ?? []
            const evictionExemptTerminalTabIds = forceParkedTerminalWorktreeIds.has(workspace.id)
              ? selectEvictionExemptTerminalTabIds(workspace.id, terminalTabs)
              : null
            return (
              <div
                key={workspace.id}
                className={
                  isVisible
                    ? 'absolute inset-0'
                    : shouldMeasureHiddenWorktree
                      ? 'pointer-events-none absolute inset-0 opacity-0'
                      : 'absolute inset-0 hidden'
                }
                aria-hidden={!isVisible}
              >
                <CodexRestartChip isVisible={isVisible} worktreeId={workspace.id} />
                {terminalTabs
                  .filter((tab) =>
                    shouldMountBackgroundWorktreeTab(
                      backgroundMountTabIdsByWorktree.get(workspace.id) ?? null,
                      tab.id
                    )
                  )
                  .map((tab) => {
                    const isActiveTerminalTab =
                      isVisible && tab.id === activeTabId && activeTabType === 'terminal'
                    if (shouldColdParkTerminalPanes && !evictionExemptTerminalTabIds?.has(tab.id)) {
                      return null
                    }
                    return (
                      <TerminalPane
                        key={`${tab.id}-${tab.generation ?? 0}`}
                        tabId={tab.id}
                        worktreeId={workspace.id}
                        cwd={tab.startupCwd ?? workspace.path}
                        isActive={isActiveTerminalTab}
                        isVisible={isActiveTerminalTab}
                        // Why: inactive tabs in the visible legacy surface
                        // are tab-hidden, not worktree-hidden, so they need
                        // the same light resume path as split-group overlays.
                        isWorktreeActive={isVisible}
                        onPtyExit={(ptyId) => onPtyExit(tab.id, ptyId)}
                        onCloseTab={() => onCloseTab(tab.id)}
                      />
                    )
                  })}
              </div>
            )
          })}
      </div>

      {activeWorktreeId && activeTabType === 'editor' && worktreeFiles.length > 0 && (
        <Suspense
          fallback={
            <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
              {translate('auto.components.Terminal.5c1d2a32bb', 'Loading editor...')}
            </div>
          }
        >
          <EditorPanel />
        </Suspense>
      )}
    </>
  )
}
