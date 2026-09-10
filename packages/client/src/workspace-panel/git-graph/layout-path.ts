import type { GitGraphEdge, GitGraphGrid, GitGraphLineStyle } from './layout'
import { GIT_GRAPH_COLORS } from './palette'

// Why: pixel geometry split out of layout.ts's lane-assignment algorithm —
// this file only converts grid points into SVG coordinates/paths, so the
// 300-line cap on the vertex/colour bookkeeping has room for the row-gap
// feature without needing another split.

export type GitGraphRowGap = { afterRow: number; height: number }
export const GIT_GRAPH_EXPAND_HEIGHT = 250

// Why: the graph shares the home charts' pixel-art register (dither-kit paints
// on a half-resolution canvas), so every pixel coordinate lands on a 2px
// lattice and diagonals become visible stairs instead of smooth curves.
export const GIT_GRAPH_PIXEL_SIZE = 2
const GIT_GRAPH_PIXEL_STEPS = 4

function snapToPixelLattice(value: number): number {
  return Math.round(value / GIT_GRAPH_PIXEL_SIZE) * GIT_GRAPH_PIXEL_SIZE
}

export type GridPoint = { x: number; y: number }
export type LayoutContext = {
  grid: GitGraphGrid
  style: GitGraphLineStyle
  rowGap?: GitGraphRowGap
}

// Why: every grid point funnels through here, so an expanded row's gap
// (commit details reflowing rows instead of overlaying them) only needs to
// add `height` once a point's row is past `afterRow` — vertices and the
// baked edge paths below both call this, so a gap-crossing edge stretches.
function toPixel(
  point: GridPoint,
  grid: GitGraphGrid,
  rowGap?: GitGraphRowGap
): { x: number; y: number } {
  const gapOffset = rowGap && point.y > rowGap.afterRow ? rowGap.height : 0
  return {
    x: grid.offsetX + point.x * grid.x,
    y: grid.offsetY + point.y * grid.y + gapOffset
  }
}

// Why: a lane change becomes a run of axis-aligned 2px stairs — the same
// blocky vocabulary the dither charts use — so no segment is ever a curve or
// an off-lattice diagonal that the renderer would have to antialias.
function pixelStaircase(from: { x: number; y: number }, to: { x: number; y: number }): string {
  let path = ''
  let previousY = snapToPixelLattice(from.y)
  for (let step = 1; step <= GIT_GRAPH_PIXEL_STEPS; step++) {
    const progress = step / GIT_GRAPH_PIXEL_STEPS
    const x = snapToPixelLattice(from.x + (to.x - from.x) * progress)
    const y = snapToPixelLattice(from.y + (to.y - from.y) * progress)
    path += `L${x},${previousY}L${x},${y}`
    previousY = y
  }
  return path
}

// Why: ports `Branch.draw`'s per-segment path verbatim — angular is two
// straight elbow segments anchored at the locked endpoint; rounded is a
// single cubic Bezier with control points pulled `d` px off each endpoint.
function pathFromPoints(
  points: readonly GridPoint[],
  lockedFirstFlags: readonly boolean[],
  { grid, style, rowGap }: LayoutContext
): string {
  const d = grid.y * (style === 'angular' ? 0.38 : 0.8)
  const first = toPixel(points[0]!, grid, rowGap)
  let path =
    style === 'pixel'
      ? `M${snapToPixelLattice(first.x)},${snapToPixelLattice(first.y)}`
      : `M${first.x.toFixed(0)},${first.y.toFixed(1)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = toPixel(points[i]!, grid, rowGap)
    const p2 = toPixel(points[i + 1]!, grid, rowGap)
    if (style === 'pixel') {
      path +=
        p1.x === p2.x
          ? `L${snapToPixelLattice(p2.x)},${snapToPixelLattice(p2.y)}`
          : pixelStaircase(p1, p2)
    } else if (p1.x === p2.x) {
      path += `L${p2.x.toFixed(0)},${p2.y.toFixed(1)}`
    } else if (style === 'angular') {
      path += lockedFirstFlags[i]
        ? `L${p2.x.toFixed(0)},${(p2.y - d).toFixed(1)}L${p2.x.toFixed(0)},${p2.y.toFixed(1)}`
        : `L${p1.x.toFixed(0)},${(p1.y + d).toFixed(1)}L${p2.x.toFixed(0)},${p2.y.toFixed(1)}`
    } else {
      path += `C${p1.x.toFixed(0)},${(p1.y + d).toFixed(1)} ${p2.x.toFixed(0)},${(p2.y - d).toFixed(1)} ${p2.x.toFixed(0)},${p2.y.toFixed(1)}`
    }
  }
  return path
}

export function makeEdge(
  fromCommitId: string,
  toCommitId: string,
  colour: number,
  points: readonly GridPoint[],
  locks: readonly boolean[],
  isMerge: boolean,
  ctx: LayoutContext
): GitGraphEdge {
  return {
    fromCommitId,
    toCommitId,
    colorIndex: colour % GIT_GRAPH_COLORS.length,
    path: pathFromPoints(points, locks, ctx),
    isMerge
  }
}

// Why: an off-page/root dead-end permanently retires its lane's colour —
// upstream reserves the column through every remaining row instead of
// freeing it. We skip the implied per-row reservation loop: nothing can
// ever look up a connection towards a null/absent parent, so there is no
// correctness cost, only less busywork.
export function makeOffPageEdge(
  childId: string,
  parentSha: string,
  colour: number,
  lastPoint: GridPoint,
  isMerge: boolean,
  ctx: LayoutContext
): GitGraphEdge {
  const stubEnd: GridPoint = { x: lastPoint.x, y: lastPoint.y + 0.6 }
  return makeEdge(childId, parentSha, colour, [lastPoint, stubEnd], [true], isMerge, ctx)
}
