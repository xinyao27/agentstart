import type { LegendListRef } from '@legendapp/list/react'
import type { ProjectGroup } from '@yiru/protocol/project/group-model'
import type { Repo } from '@yiru/protocol/project/repository'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { PendingSidebarRowReveal } from '~renderer/application-shell/state/slice'
import { translate } from '~renderer/i18n/i18n'

import {
  workspaceIndexForLocalRowIndex,
  type WorkspaceSidebarProjectedRow
} from '../workspace-sidebar-row-projection'
import type { ProjectGroupingModel, WorktreeGroupBy } from './groups'
import {
  getSidebarRowRevealAncestorKeys,
  revealMountedSidebarRowElement,
  rowKeyMatchesRenderRow
} from './reveal'
import type { RenderRow } from './virtual-rows'

export function useRowReveal(args: {
  pending: PendingSidebarRowReveal | null
  repoMap: Map<string, Repo>
  projectGroups: readonly ProjectGroup[]
  projectGrouping?: ProjectGroupingModel
  collapsedGroups: ReadonlySet<string>
  groupBy: WorktreeGroupBy
  toggleGroup: (key: string) => void
  renderRows: readonly RenderRow[]
  workspaceRows: readonly WorkspaceSidebarProjectedRow[]
  clearPending: () => void
  legendListRef: React.RefObject<LegendListRef | null>
  scrollRef: React.RefObject<HTMLDivElement | null>
  flash: (rowKey: string) => void
  scheduleFrame: (callback: FrameRequestCallback) => void
  cancelFrames: () => void
}): void {
  const [retryTick, setRetryTick] = useState(0)
  const retryRef = useRef<{ rowKey: string; count: number } | null>(null)
  useEffect(() => {
    if (!args.pending) {
      return
    }
    const pending = args.pending
    const isProjectHeader =
      pending.rowKey.startsWith('project-group:') ||
      pending.rowKey.startsWith('project:') ||
      pending.rowKey.startsWith('repo:')
    if (isProjectHeader && args.groupBy !== 'repo') {
      return
    }

    let toggledAncestor = false
    for (const groupKey of getSidebarRowRevealAncestorKeys({
      rowKey: pending.rowKey,
      repoMap: args.repoMap,
      projectGroups: args.projectGroups,
      projectGrouping: args.projectGrouping
    })) {
      if (args.collapsedGroups.has(groupKey)) {
        args.toggleGroup(groupKey)
        toggledAncestor = true
      }
    }
    if (toggledAncestor) {
      return
    }

    let cancelled = false
    const retry = () => {
      const previous = retryRef.current
      const count = previous?.rowKey === pending.rowKey ? previous.count + 1 : 1
      retryRef.current = { rowKey: pending.rowKey, count }
      if (count > 8) {
        return false
      }
      args.scheduleFrame(() => {
        if (!cancelled) {
          setRetryTick((tick) => tick + 1)
        }
      })
      return true
    }
    args.scheduleFrame(() => {
      if (cancelled) {
        return
      }
      const targetIndex = args.renderRows.findIndex((row) =>
        rowKeyMatchesRenderRow(row, pending.rowKey)
      )
      if (targetIndex === -1) {
        if (retry()) {
          return
        }
        retryRef.current = null
        args.clearPending()
        toast.error(
          translate(
            'auto.components.sidebar.WorktreeList.sidebarRowMissing',
            'Target no longer exists'
          )
        )
        return
      }
      const revealed = args.scrollRef.current
        ? revealMountedSidebarRowElement(args.scrollRef.current, pending.rowKey, pending.behavior)
        : null
      if (revealed) {
        if (pending.highlight) {
          args.flash(pending.rowKey)
        }
        retryRef.current = null
        args.clearPending()
        return
      }
      void args.legendListRef.current?.scrollIndexIntoView({
        index: workspaceIndexForLocalRowIndex(args.workspaceRows, targetIndex),
        animated: false
      })
      if (!retry()) {
        retryRef.current = null
        args.clearPending()
      }
    })
    return () => {
      cancelled = true
      args.cancelFrames()
    }
  }, [args, retryTick])
}
