import type { LatticeVariant, MorphVariant, RingVariant } from '@yiru/protocol/settings/loader'

const LATTICE_SIZE = 3
const LATTICE_MIDDLE = (LATTICE_SIZE - 1) / 2
const LATTICE_RING: readonly [number, number][] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [2, 1],
  [2, 2],
  [1, 2],
  [0, 2],
  [0, 1]
]
const LATTICE_RING_INDEX = new Map(LATTICE_RING.map(([x, y], index) => [`${x},${y}`, index]))

export type LatticeCell = {
  id: string
  x: number
  y: number
  delayMs: number
  still: boolean
  middle: boolean
}

function getLatticeDelay(variant: LatticeVariant, x: number, y: number): number {
  const dx = x - LATTICE_MIDDLE
  const dy = y - LATTICE_MIDDLE
  switch (variant) {
    case 'S1':
      return Math.hypot(dx, dy) * 700 - (dx === 0 && dy === 0 ? 180 : 0)
    case 'S2':
      return ((x + y) / (2 * (LATTICE_SIZE - 1))) * 1500
    case 'S3': {
      const index = LATTICE_RING_INDEX.get(`${x},${y}`)
      return index === undefined
        ? 0
        : -(((LATTICE_RING.length - index) % LATTICE_RING.length) / LATTICE_RING.length) * 1700
    }
    case 'S4':
      return (x / (LATTICE_SIZE - 1)) * 1100
    case 'S5': {
      const index = LATTICE_RING_INDEX.get(`${x},${y}`)
      if (index === undefined) {
        return 0
      }
      return -(((index * 3) % LATTICE_RING.length) / LATTICE_RING.length) * 1700
    }
  }
}

export function getLatticeCells(variant: LatticeVariant): readonly LatticeCell[] {
  const cells: LatticeCell[] = []
  for (let y = 0; y < LATTICE_SIZE; y += 1) {
    for (let x = 0; x < LATTICE_SIZE; x += 1) {
      cells.push({
        id: `${x},${y}`,
        x,
        y,
        delayMs: getLatticeDelay(variant, x, y),
        still: (variant === 'S3' || variant === 'S5') && !LATTICE_RING_INDEX.has(`${x},${y}`),
        middle: x === LATTICE_MIDDLE && y === LATTICE_MIDDLE
      })
    }
  }
  return cells
}

const RING_COUNT = 8
const RING_RADIUS = 8

export type RingDot = {
  id: number
  x: number
  y: number
  delayMs: number
}

export function getRingDurationMs(variant: RingVariant): number {
  switch (variant) {
    case 'C1':
      return 1600
    case 'C2':
      return 2000
    case 'C3':
      return 1800
    case 'C4':
      return 1600
    case 'C5':
      return 2200
  }
}

export function getRingAnimationDurationMs(variant: RingVariant): number {
  return variant === 'C5' ? 1800 : getRingDurationMs(variant)
}

function getRingDelayMs(variant: RingVariant, index: number): number {
  const duration = getRingDurationMs(variant)
  switch (variant) {
    case 'C1':
    case 'C2':
    case 'C3':
      return -((RING_COUNT - 1 - index) / RING_COUNT) * duration
    case 'C4':
      return index % 2 === 0 ? 0 : -(duration / 2)
    case 'C5':
      return -(((index * 3) % RING_COUNT) / RING_COUNT) * duration
  }
}

export function getRingDots(variant: RingVariant): readonly RingDot[] {
  return Array.from({ length: RING_COUNT }, (_, id) => {
    const angle = (id / RING_COUNT) * Math.PI * 2 - Math.PI / 2
    return {
      id,
      x: Math.cos(angle) * RING_RADIUS,
      y: Math.sin(angle) * RING_RADIUS,
      delayMs: getRingDelayMs(variant, id)
    }
  })
}

const MORPH_COUNT = 8
const MORPH_RADIUS = 7
type ShapeFunction = (index: number) => readonly [number, number]

const shapeCircle: ShapeFunction = (index) => {
  const angle = (index / MORPH_COUNT) * Math.PI * 2 - Math.PI / 2
  return [Math.cos(angle) * MORPH_RADIUS, Math.sin(angle) * MORPH_RADIUS]
}

const shapeSquare: ShapeFunction = (index) => {
  const half = MORPH_RADIUS * 0.85
  const corners: readonly [number, number][] = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half]
  ]
  const position = ((index / MORPH_COUNT) * 4 + 0.5) % 4
  const side = Math.floor(position) % 4
  const fraction = position - Math.floor(position)
  const from = corners[side]
  const to = corners[(side + 1) % corners.length]
  return [from[0] + (to[0] - from[0]) * fraction, from[1] + (to[1] - from[1]) * fraction]
}

const shapeCircleAt =
  (turn: number): ShapeFunction =>
  (index) => {
    const angle = (index / MORPH_COUNT) * Math.PI * 2 - Math.PI / 2 + turn
    return [Math.cos(angle) * MORPH_RADIUS, Math.sin(angle) * MORPH_RADIUS]
  }

const shapeScatter: ShapeFunction = (index) => {
  const angle = (index / MORPH_COUNT) * Math.PI * 2 - Math.PI / 2
  return [-Math.cos(angle) * MORPH_RADIUS, Math.sin(angle) * MORPH_RADIUS]
}

const shapeDiamond: ShapeFunction = (index) => {
  const corners: readonly [number, number][] = [
    [0, -MORPH_RADIUS],
    [MORPH_RADIUS, 0],
    [0, MORPH_RADIUS],
    [-MORPH_RADIUS, 0]
  ]
  const position = (index / MORPH_COUNT) * 4
  const side = Math.floor(position) % 4
  const fraction = position - Math.floor(position)
  const from = corners[side]
  const to = corners[(side + 1) % corners.length]
  return [from[0] + (to[0] - from[0]) * fraction, from[1] + (to[1] - from[1]) * fraction]
}

const shapeCenter: ShapeFunction = (index) => {
  const angle = (index / MORPH_COUNT) * Math.PI * 2 - Math.PI / 2
  return [Math.cos(angle) * 1.5, Math.sin(angle) * 1.5]
}

function getMorphShapes(
  variant: MorphVariant
): readonly [ShapeFunction, ShapeFunction, ShapeFunction, ShapeFunction] {
  switch (variant) {
    case 'M1':
      return [shapeCircle, shapeSquare, shapeDiamond, shapeSquare]
    case 'M2':
      return [shapeCenter, shapeCircle, shapeCenter, shapeCircle]
    case 'M3':
      return [
        shapeCircleAt(0),
        shapeCircleAt(Math.PI / 2),
        shapeCircleAt(Math.PI),
        shapeCircleAt(Math.PI * 1.5)
      ]
    case 'M4':
      return [shapeCircle, shapeDiamond, shapeCircle, shapeDiamond]
    case 'M5':
      return [shapeCircle, shapeScatter, shapeCircle, shapeScatter]
  }
}

export type MorphDot = {
  id: number
  points: readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
    readonly [number, number]
  ]
  depth: number
  delayMs: number
}

export function getMorphDots(variant: MorphVariant): readonly MorphDot[] {
  const [first, second, third, fourth] = getMorphShapes(variant)
  return Array.from({ length: MORPH_COUNT }, (_, id) => ({
    id,
    points: [first(id), second(id), third(id), fourth(id)],
    depth: Math.abs(Math.cos((id / MORPH_COUNT) * Math.PI * 2 - Math.PI / 2)),
    delayMs: variant === 'M5' ? -id * 10 : 0
  }))
}
