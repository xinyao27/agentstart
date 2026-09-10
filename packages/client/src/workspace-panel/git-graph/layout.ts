import type { GitHistoryItem } from '@agentstart/protocol/git/history-types'

import { makeEdge, makeOffPageEdge, type GitGraphRowGap, type LayoutContext } from './layout-path'
import { GIT_GRAPH_COLORS } from './palette'

export { GIT_GRAPH_EXPAND_HEIGHT, GIT_GRAPH_PIXEL_SIZE, type GitGraphRowGap } from './layout-path'

// Why: faithful port of vscode-git-graph's `web/graph.ts` column/colour reuse
// algorithm (getAvailableColour + registerUnavailablePoint + the merge
// point-connecting walk) onto our GitHistoryItem shape. Pixel geometry
// (toPixel/pathFromPoints/makeEdge) lives in ./layout-path.ts, and lane
// colours live in ./palette.ts.

export type GitGraphLineStyle = 'rounded' | 'angular' | 'pixel'
export type GitGraphGrid = { x: number; y: number; offsetX: number; offsetY: number }

export const GIT_GRAPH_DEFAULT_GRID: GitGraphGrid = { x: 16, y: 24, offsetX: 16, offsetY: 12 }

type GitGraphVertex = {
  commitId: string
  row: number
  column: number
  colorIndex: number
  isCurrentHead: boolean
}
export type GitGraphEdge = {
  fromCommitId: string
  toCommitId: string
  colorIndex: number
  path: string
  isMerge: boolean
}
export type GitGraphLayout = {
  vertices: readonly GitGraphVertex[]
  edges: readonly GitGraphEdge[]
  columnCount: number
  width: number
}
type GridPoint = { x: number; y: number }
type ParentEntry = { targetIndex: number | null; sha: string }

type MutableVertex = {
  commitId: string
  parentEntries: ParentEntry[]
  nextParentPtr: number
  x: number
  nextX: number
  colour: number | null
  // Why: column -> reservation, mirroring `Vertex.connections` upstream — lets
  // a later merge line find the column an earlier line laid towards a parent.
  connections: Map<number, { targetIndex: number | null; colour: number }>
}

const pointOf = (v: MutableVertex, row: number): GridPoint => ({ x: v.x, y: row })
const nextPointOf = (v: MutableVertex, row: number): GridPoint => ({ x: v.nextX, y: row })

function registerUnavailablePoint(
  v: MutableVertex,
  x: number,
  targetIndex: number | null,
  colour: number
): void {
  if (x !== v.nextX) {
    return
  }
  v.nextX = x + 1
  v.connections.set(x, { targetIndex, colour })
}

function getPointConnectingTo(
  v: MutableVertex,
  row: number,
  targetIndex: number,
  colour: number
): GridPoint | null {
  for (const [x, connection] of v.connections) {
    if (connection.targetIndex === targetIndex && connection.colour === colour) {
      return { x, y: row }
    }
  }
  return null
}

function buildVertices(items: readonly GitHistoryItem[]): MutableVertex[] {
  const indexById = new Map<string, number>()
  items.forEach((item, index) => indexById.set(item.id, index))
  return items.map((item) => ({
    commitId: item.id,
    parentEntries: item.parentIds.map((sha) => ({ targetIndex: indexById.get(sha) ?? null, sha })),
    nextParentPtr: 0,
    x: 0,
    nextX: 0,
    colour: null,
    connections: new Map()
  }))
}

function getAvailableColour(availableColours: number[], startAt: number): number {
  for (let i = 0; i < availableColours.length; i++) {
    if (startAt > availableColours[i]!) {
      return i
    }
  }
  availableColours.push(0)
  return availableColours.length - 1
}

function determinePath(
  startAt: number,
  vertices: MutableVertex[],
  availableColours: number[],
  edges: GitGraphEdge[],
  ctx: LayoutContext
): void {
  const startVertex = vertices[startAt]!
  const nextEntry = (v: MutableVertex): ParentEntry | null =>
    v.nextParentPtr < v.parentEntries.length ? v.parentEntries[v.nextParentPtr]! : null

  const startEntry = nextEntry(startVertex)
  const isMergeConnect =
    startEntry !== null &&
    startEntry.targetIndex !== null &&
    startVertex.parentEntries.length > 1 &&
    startVertex.colour !== null &&
    vertices[startEntry.targetIndex]!.colour !== null

  if (isMergeConnect) {
    const targetIndex = startEntry!.targetIndex!
    const parentVertex = vertices[targetIndex]!
    const colour = parentVertex.colour!
    let lastPoint = pointOf(startVertex, startAt)
    const points: GridPoint[] = [lastPoint]
    const locks: boolean[] = []
    let found = false
    for (let row = startAt + 1; row < vertices.length; row++) {
      const curV = vertices[row]!
      let curPoint = getPointConnectingTo(curV, row, targetIndex, colour)
      if (curPoint) {
        found = true
      } else {
        curPoint = nextPointOf(curV, row)
      }
      locks.push(!found && curV !== parentVertex ? lastPoint.x < curPoint.x : true)
      points.push(curPoint)
      registerUnavailablePoint(curV, curPoint.x, targetIndex, colour)
      lastPoint = curPoint
      if (found) {
        startVertex.nextParentPtr++
        break
      }
    }
    edges.push(
      makeEdge(startVertex.commitId, parentVertex.commitId, colour, points, locks, true, ctx)
    )
    return
  }

  const colour = getAvailableColour(availableColours, startAt)
  let vertex = startVertex
  const wasOnBranch = vertex.colour !== null
  const lastPointInit = wasOnBranch ? pointOf(vertex, startAt) : nextPointOf(vertex, startAt)
  if (!wasOnBranch) {
    Object.assign(vertex, { colour, x: lastPointInit.x })
  }
  let lastPoint = lastPointInit
  registerUnavailablePoint(vertex, lastPoint.x, startAt, colour)

  let row = startAt + 1
  let finalRow = startAt
  for (;;) {
    const parentEntry = nextEntry(vertex)
    const isMerge = vertex.parentEntries.length > 1
    if (parentEntry === null) {
      finalRow = vertices.length
      break
    }
    // Why: null means the parent is off-page (not in this page's items); an
    // index behind our row pointer means malformed/non-topo-ordered input.
    // Both dead-end the same way: a stub line and a permanently retired lane.
    if (parentEntry.targetIndex === null || parentEntry.targetIndex < row) {
      const offPageId =
        parentEntry.targetIndex === null
          ? parentEntry.sha
          : vertices[parentEntry.targetIndex]!.commitId
      edges.push(makeOffPageEdge(vertex.commitId, offPageId, colour, lastPoint, isMerge, ctx))
      vertex.nextParentPtr++
      finalRow = vertices.length
      break
    }
    const targetIndex = parentEntry.targetIndex
    const edgeChildId = vertex.commitId
    const points: GridPoint[] = [lastPoint]
    const locks: boolean[] = []
    for (; row < vertices.length; row++) {
      const curV = vertices[row]!
      const curPoint =
        row === targetIndex && curV.colour !== null ? pointOf(curV, row) : nextPointOf(curV, row)
      locks.push(lastPoint.x < curPoint.x)
      points.push(curPoint)
      registerUnavailablePoint(curV, curPoint.x, targetIndex, colour)
      lastPoint = curPoint
      if (row === targetIndex) {
        row++
        break
      }
    }
    // Why: targetIndex >= row was guaranteed above, and every row up to it was
    // just walked, so the loop above always reaches it before running out.
    const parentVertex = vertices[targetIndex]!
    vertex.nextParentPtr++
    const parentWasOnBranch = parentVertex.colour !== null
    if (!parentWasOnBranch) {
      Object.assign(parentVertex, { colour, x: lastPoint.x })
    }
    edges.push(makeEdge(edgeChildId, parentVertex.commitId, colour, points, locks, isMerge, ctx))
    if (parentWasOnBranch) {
      finalRow = row
      break
    }
    vertex = parentVertex
  }
  availableColours[colour] = finalRow
}

export function buildGitGraphLayout(
  items: readonly GitHistoryItem[],
  options?: {
    style?: GitGraphLineStyle
    grid?: GitGraphGrid
    headCommitId?: string | null
    // Why: commit details push every following row down instead of overlaying
    // it — every pixel Y for a grid point at row > afterRow gains `height`.
    // toPixel (in ./layout-path) is the single funnel this passes through, so
    // both vertex circles and baked edge paths honour it automatically.
    rowGap?: GitGraphRowGap
  }
): GitGraphLayout {
  const ctx: LayoutContext = {
    grid: options?.grid ?? GIT_GRAPH_DEFAULT_GRID,
    style: options?.style ?? 'pixel',
    rowGap: options?.rowGap
  }
  const grid = ctx.grid
  const headCommitId = options?.headCommitId ?? null

  if (items.length === 0) {
    return { vertices: [], edges: [], columnCount: 0, width: 0 }
  }

  const vertices = buildVertices(items)
  const availableColours: number[] = []
  const edges: GitGraphEdge[] = []
  let i = 0
  while (i < vertices.length) {
    const v = vertices[i]!
    const hasNextParent = v.nextParentPtr < v.parentEntries.length
    if (hasNextParent || v.colour === null) {
      determinePath(i, vertices, availableColours, edges, ctx)
    } else {
      i++
    }
  }

  const outVertices: GitGraphVertex[] = vertices.map((v, row) => ({
    commitId: v.commitId,
    row,
    column: v.x,
    colorIndex: (v.colour ?? 0) % GIT_GRAPH_COLORS.length,
    isCurrentHead: headCommitId !== null && v.commitId === headCommitId
  }))

  const maxX = vertices.reduce((max, v) => Math.max(max, v.x), 0)
  const maxNextX = vertices.reduce((max, v) => Math.max(max, v.nextX), 0)
  const width = grid.offsetX * 2 + Math.max(0, maxNextX - 1) * grid.x
  return { vertices: outVertices, edges, columnCount: maxX + 1, width }
}
