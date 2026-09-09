import type { LegendListRef } from '@legendapp/list/react'
import { keybindingMatchesAction } from '@yiru/protocol/keybindings'
import type { ProjectGroup } from '@yiru/protocol/project/group-model'
import type { Repo } from '@yiru/protocol/project/repository'
import type { ProjectOrderBy } from '@yiru/protocol/settings/ui-state'
import type { WorkspaceStatusDefinition } from '@yiru/protocol/workspace/status/model'
import type { WorktreeLineage } from '@yiru/protocol/worktree/lineage'
import type { Worktree } from '@yiru/protocol/worktree/model'
import { useEffect } from 'react'
import { getShortcutPlatform } from '~renderer/keyboard-input/shortcut-platform'
import { useEventCallback } from '~renderer/react/use-event-callback'
import type { AppState } from '~renderer/store/types'
import { activateAndRevealWorktree } from '~renderer/worktree/activation'

import {
  workspaceIndexForLocalRowIndex,
  type WorkspaceSidebarProjectedRow
} from '../workspace-sidebar-row-projection'
import {
  setHasWorktreeNavigationTargets,
  subscribeToWorktreeNavigationRequests
} from '../worktree-navigation-request'
import { getPreferredWorktreeRows } from '../worktree-sidebar-row-preference'
import {
  buildRows,
  getPinnedWorktreeDisplayPolicy,
  type ProjectGroupingModel,
  type WorktreeGroupBy
} from './groups'
import { isEditableTarget } from './reveal'
import { findPreferredRenderRowIndexForWorktree } from './row-model'
import type { RenderRow } from './virtual-rows'

export function useWorktreeNavigation(args: {
  groupBy: WorktreeGroupBy
  worktrees: readonly Worktree[]
  repoMap: Map<string, Repo>
  prCache: AppState['prCache'] | null
  collapsedGroups: ReadonlySet<string>
  repoOrder: Map<string, number>
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  projectOrderBy: ProjectOrderBy
  lineageById: Record<string, WorktreeLineage>
  worktreeMap: Map<string, Worktree>
  settings: AppState['settings']
  projectGroups: readonly ProjectGroup[]
  projectGrouping?: ProjectGroupingModel
  activeWorktreeId: string | null
  renderRows: readonly RenderRow[]
  workspaceRows: readonly WorkspaceSidebarProjectedRow[]
  legendListRef: React.RefObject<LegendListRef | null>
  scrollRef: React.RefObject<HTMLDivElement | null>
  activeModal: string
  keybindings: AppState['keybindings']
  markDirectScrollInput: () => void
}): (event: React.KeyboardEvent) => void {
  const navigate = (direction: 'up' | 'down') => {
    // Why: cycling uses the all-expanded model so collapsed Pinned/All or lineage
    // sections cannot make keyboard navigation skip a workspace.
    const allWorktreeRows = buildRows({
      groupBy: args.groupBy,
      worktrees: [...args.worktrees],
      repoMap: args.repoMap,
      prCache: args.prCache,
      collapsedGroups: new Set<string>(),
      repoOrder: args.repoOrder,
      workspaceStatuses: args.workspaceStatuses,
      projectOrderBy: args.projectOrderBy,
      lineageById: args.lineageById,
      worktreeMap: args.worktreeMap,
      nestLineage: true,
      settings: args.settings,
      projectGroups: args.projectGroups,
      projectGrouping: args.projectGrouping
    }).filter((row): row is Extract<RenderRow, { type: 'item' }> => row.type === 'item')
    const pinnedPolicy = getPinnedWorktreeDisplayPolicy(args.settings)
    const rows = getPreferredWorktreeRows(allWorktreeRows, pinnedPolicy)
    if (rows.length === 0) {
      return
    }

    const currentIndex = rows.findIndex((row) => row.worktree.id === args.activeWorktreeId)
    let nextIndex = direction === 'up' ? rows.length - 1 : 0
    if (currentIndex !== -1) {
      nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
      if (nextIndex < 0) {
        nextIndex = rows.length - 1
      }
      if (nextIndex >= rows.length) {
        nextIndex = 0
      }
    }
    const nextWorktreeId = rows[nextIndex].worktree.id
    activateAndRevealWorktree(nextWorktreeId)
    const rowIndex = findPreferredRenderRowIndexForWorktree(
      args.renderRows,
      nextWorktreeId,
      pinnedPolicy === 'duplicate-in-groups'
    )
    if (rowIndex !== -1) {
      void args.legendListRef.current?.scrollIndexIntoView({
        index: workspaceIndexForLocalRowIndex(args.workspaceRows, rowIndex),
        animated: false
      })
    }
  }

  const handleDirectNavigation = useEventCallback((direction: 'up' | 'down') => {
    args.markDirectScrollInput()
    navigate(direction)
  })
  useEffect(() => {
    setHasWorktreeNavigationTargets(args.worktrees.length > 0)
    return () => setHasWorktreeNavigationTargets(false)
  }, [args.worktrees.length])
  useEffect(
    () => subscribeToWorktreeNavigationRequests(handleDirectNavigation),
    [handleDirectNavigation]
  )
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (args.activeModal !== 'none' || isEditableTarget(event.target)) {
        return
      }
      const platform = getShortcutPlatform()
      if (keybindingMatchesAction('sidebar.focusWorktreeList', event, platform, args.keybindings)) {
        args.scrollRef.current?.focus()
        event.preventDefault()
        return
      }
      const direction = keybindingMatchesAction(
        'worktree.navigateUp',
        event,
        platform,
        args.keybindings
      )
        ? 'up'
        : keybindingMatchesAction('worktree.navigateDown', event, platform, args.keybindings)
          ? 'down'
          : null
      if (direction) {
        handleDirectNavigation(direction)
        event.preventDefault()
      }
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [args.activeModal, args.keybindings, args.scrollRef, handleDirectNavigation])

  return (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (event.target !== event.currentTarget) {
        return
      }
      handleDirectNavigation(event.key === 'ArrowUp' ? 'up' : 'down')
      event.preventDefault()
    } else if (event.key === 'Enter') {
      const terminalInput = document.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')
      terminalInput?.focus()
      event.preventDefault()
    } else if (['PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
      args.markDirectScrollInput()
    }
  }
}
