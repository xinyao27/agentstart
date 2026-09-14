import type React from 'react'
import { cn } from '~renderer/ui/class-names'

import type { NavigationProjectedRow } from './navigation-row-projection'
import {
  getProjectGroupHeaderPaddingLeft,
  getProjectWorktreeCardContentIndent,
  getWorktreeCardStatusGlyphLeft,
  WORKTREE_CARD_STATUS_ICON_CENTER_TOP
} from './worktree-list/indentation'

type ProjectWorkspaceRail = {
  leftPx: number
  projectKey: string
  segment: 'header' | 'workspace'
  // Why: every workspace row turns the rail into its own status glyph, so the
  // section reads as a tree of siblings instead of one line with a single tick.
  elbowWidthPx?: number
  // Why: the last workspace row stops the vertical run at its own tick instead
  // of running the line past it, so the tree reads as terminated rather than cut.
  endsSection?: boolean
}

type ProjectWorkspaceRailStartProps = {
  paddingLeftPx: number
}

type ProjectWorkspaceRailRowProps = {
  leftPx: number
  elbowWidthPx?: number
  endsSection?: boolean
}

const PROJECT_ICON_CENTER_OFFSET_PX = 10
// Why: the elbow points at the last row's glyph rather than touching it, matching
// the gap the inline agent rail keeps at its own corner.
const RAIL_ELBOW_GLYPH_GAP_PX = 6
// Why: each row draws its own rail segment, so every segment overshoots the row
// top by the list gap to keep the line unbroken between cards.
const RAIL_ROW_OVERLAP_PX = 2

function isSectionBoundary(row: NavigationProjectedRow): boolean {
  return row.row.type === 'header' || row.row.type === 'host-header'
}

function isWorkspaceRow(row: NavigationProjectedRow): boolean {
  return (
    row.row.type === 'item' ||
    row.row.type === 'folder-workspace' ||
    row.row.type === 'lineage-group'
  )
}

// Why: a lineage group renders its parent worktree card at the row top, so its
// tick lands on the same glyph a plain workspace row would expose.
function getRailTickCard(
  projected: NavigationProjectedRow
): { groupDepth: number; depth: number } | undefined {
  if (projected.row.type === 'item') {
    return projected.row
  }
  return projected.row.type === 'lineage-group' ? projected.row.rows[0] : undefined
}

function getRailElbowWidthPx(projected: NavigationProjectedRow, railLeftPx: number): number | null {
  const card = getRailTickCard(projected)
  if (!card) {
    return null
  }
  // Why: rails exist only under repo grouping, where workspace cards take the
  // project-grouped indent — one tree step past the generic grouped anchor.
  const elbowWidthPx =
    getWorktreeCardStatusGlyphLeft(
      getProjectWorktreeCardContentIndent({
        groupDepth: card.groupDepth,
        lineageDepth: card.depth
      })
    ) -
    railLeftPx -
    RAIL_ELBOW_GLYPH_GAP_PX

  return elbowWidthPx > 0 ? elbowWidthPx : null
}

// Why: only a plain workspace card ends where its own glyph sits. Lineage
// groups keep descendants inside the same row, so terminating the rail at the
// parent glyph would strand every child below the line.
function canRowEndSection(projected: NavigationProjectedRow): boolean {
  return projected.row.type === 'item'
}

export function getProjectWorkspaceRails(
  rows: readonly NavigationProjectedRow[]
): ReadonlyMap<number, ProjectWorkspaceRail> {
  const rails = new Map<number, ProjectWorkspaceRail>()
  let activeProject:
    | {
        headerIndex: number
        headerKey: string
        leftPx: number
        sectionIndexes: number[]
        elbowWidthPxByIndex: Map<number, number>
        lastWorkspaceOffset: number | null
        lastWorkspaceEndsSection: boolean
      }
    | undefined

  const finishProject = (): void => {
    const project = activeProject
    activeProject = undefined
    if (!project || project.lastWorkspaceOffset === null) {
      return
    }
    rails.set(project.headerIndex, {
      leftPx: project.leftPx,
      projectKey: project.headerKey,
      segment: 'header'
    })
    const lastWorkspaceIndex = project.sectionIndexes[project.lastWorkspaceOffset]
    for (const sectionIndex of project.sectionIndexes.slice(0, project.lastWorkspaceOffset + 1)) {
      rails.set(sectionIndex, {
        leftPx: project.leftPx,
        projectKey: project.headerKey,
        segment: 'workspace',
        elbowWidthPx: project.elbowWidthPxByIndex.get(sectionIndex),
        endsSection: sectionIndex === lastWorkspaceIndex && project.lastWorkspaceEndsSection
      })
    }
  }

  rows.forEach((projected, index) => {
    if (isSectionBoundary(projected)) {
      finishProject()
      if (projected.row.type === 'header' && projected.row.repo) {
        activeProject = {
          headerIndex: index,
          headerKey: projected.row.key,
          leftPx:
            getProjectGroupHeaderPaddingLeft(projected.row.projectGroupDepth ?? 0) +
            PROJECT_ICON_CENTER_OFFSET_PX,
          sectionIndexes: [],
          elbowWidthPxByIndex: new Map(),
          lastWorkspaceOffset: null,
          lastWorkspaceEndsSection: false
        }
      }
      return
    }

    if (!activeProject) {
      return
    }
    activeProject.sectionIndexes.push(index)
    if (isWorkspaceRow(projected)) {
      activeProject.lastWorkspaceOffset = activeProject.sectionIndexes.length - 1
      activeProject.lastWorkspaceEndsSection = canRowEndSection(projected)
      const elbowWidthPx = getRailElbowWidthPx(projected, activeProject.leftPx)
      if (elbowWidthPx !== null) {
        activeProject.elbowWidthPxByIndex.set(index, elbowWidthPx)
      }
    }
  })
  finishProject()

  return rails
}

export function ProjectWorkspaceRailStart(
  props: ProjectWorkspaceRailStartProps
): React.JSX.Element {
  const { paddingLeftPx } = props

  return (
    <span
      aria-hidden="true"
      className="bg-sidebar-border pointer-events-none absolute bottom-0 z-10 w-px"
      style={{
        left: paddingLeftPx + PROJECT_ICON_CENTER_OFFSET_PX,
        top: `calc(50% + ${PROJECT_ICON_CENTER_OFFSET_PX}px)`
      }}
    />
  )
}

/**
 * One row's slice of the project tree: the vertical run through the row, plus
 * the horizontal tick into its own status glyph. The run stops at the tick on
 * the row that ends the section and continues to the next row otherwise.
 */
export function ProjectWorkspaceRailRow(props: ProjectWorkspaceRailRowProps): React.JSX.Element {
  const { leftPx, elbowWidthPx, endsSection = false } = props
  // Why: the run can only stop at a tick that exists — a terminal row without a
  // resolvable glyph still has to carry the line to the row's own bottom edge.
  const stopsAtElbow = endsSection && elbowWidthPx !== undefined

  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'bg-sidebar-border pointer-events-none absolute z-10 w-px',
          !stopsAtElbow && 'bottom-0'
        )}
        style={{
          left: leftPx,
          top: -RAIL_ROW_OVERLAP_PX,
          height: stopsAtElbow
            ? WORKTREE_CARD_STATUS_ICON_CENTER_TOP + RAIL_ROW_OVERLAP_PX
            : undefined
        }}
      />
      {elbowWidthPx === undefined ? null : (
        <span
          aria-hidden="true"
          className="bg-sidebar-border pointer-events-none absolute z-10 h-px"
          style={{
            left: leftPx,
            top: WORKTREE_CARD_STATUS_ICON_CENTER_TOP,
            width: elbowWidthPx
          }}
        />
      )}
    </>
  )
}
