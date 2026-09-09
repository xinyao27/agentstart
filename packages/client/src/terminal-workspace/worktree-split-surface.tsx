import type { TabGroupLayoutNode } from '@yiru/protocol/workspace/tabs'
import React from 'react'

import EmulatorPaneOverlayLayer from '../emulator-pane/overlay-layer'
import AiVaultSessionDropLayer from '../tab-group/ai-vault-session-drop-layer'
import TabGroupSplitLayout from '../tab-group/split-layout'
import CodexRestartChip from '../terminal-pane/codex-restart/chip'
import TerminalPaneOverlayLayer from '../terminal-pane/overlay-layer'

type WorktreeSplitSurfaceProps = {
  worktreeId: string
  worktreePath: string
  layout: TabGroupLayoutNode
  focusedGroupId?: string
  isVisible: boolean
  shouldMeasureHiddenWorktree: boolean
  shouldColdParkTerminalPanes: boolean
  forceParkTerminalPanes: boolean
  backgroundMountTabIds: ReadonlySet<string> | null
  activationDeferredMountTabIds: ReadonlySet<string> | null
}

// Why: each TabGroupPanel tags its body element with an `anchor-name`, and
// worktree-level overlay layers render every terminal tab once —
// keyed by pane id only — then pin each pane to the owning group's anchor via
// CSS `position-anchor`. Moving a tab between groups now only changes which
// anchor-name the overlay references, so terminals do not remount and
// terminal surfaces do not reparent or lose TUI state.
//
export const WorktreeSplitSurface = function WorktreeSplitSurface({
  worktreeId,
  worktreePath,
  layout,
  focusedGroupId,
  isVisible,
  shouldMeasureHiddenWorktree,
  shouldColdParkTerminalPanes,
  forceParkTerminalPanes,
  backgroundMountTabIds,
  activationDeferredMountTabIds
}: WorktreeSplitSurfaceProps): React.JSX.Element {
  return (
    <div
      className={
        isVisible
          ? 'absolute inset-0 flex'
          : shouldMeasureHiddenWorktree
            ? 'pointer-events-none absolute inset-0 flex opacity-0'
            : 'absolute inset-0 hidden'
      }
      // Why: hidden measurable worktrees remain paintable for terminal sizing,
      // but their controls cannot remain reachable by Tab or assistive tech.
      inert={!isVisible}
      aria-hidden={!isVisible}
    >
      <CodexRestartChip isVisible={isVisible} worktreeId={worktreeId} />
      <TabGroupSplitLayout
        layout={layout}
        worktreeId={worktreeId}
        focusedGroupId={focusedGroupId}
        isWorktreeActive={isVisible}
      />
      <TerminalPaneOverlayLayer
        worktreeId={worktreeId}
        worktreePath={worktreePath}
        isWorktreeActive={isVisible}
        coldParkTerminalPanes={shouldColdParkTerminalPanes}
        forceParkTerminalPanes={forceParkTerminalPanes}
        shouldMeasureHiddenWorktree={shouldMeasureHiddenWorktree}
        backgroundMountTabIds={backgroundMountTabIds}
        activationDeferredMountTabIds={activationDeferredMountTabIds}
      />
      {isVisible || backgroundMountTabIds === null ? (
        <EmulatorPaneOverlayLayer worktreeId={worktreeId} isWorktreeActive={isVisible} />
      ) : null}
      {/* Why: keyed by `enabled` so a visibility flip remounts with fresh drag
          state instead of needing an effect to clear a stale active drag. */}
      <AiVaultSessionDropLayer
        key={isVisible ? 'visible' : 'hidden'}
        worktreeId={worktreeId}
        enabled={isVisible}
      />
    </div>
  )
}
