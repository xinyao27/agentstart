import { frames } from './script'
import { initialState } from './state'
import type { DemoState } from './state'

/**
 * Why: the script is a list of durations, but a scrubber needs random access.
 * Precomputing frame start times turns "what does it look like at time T" into
 * a lookup plus a fold, so seeking is as cheap as playing.
 */
const starts: number[] = []
let total = 0
for (const frame of frames) {
  starts.push(total)
  total += frame.ms
}

export const FRAME_STARTS: readonly number[] = starts
export const TOTAL_MS = total

export function frameIndexAt(ms: number): number {
  const clamped = Math.max(0, Math.min(ms, TOTAL_MS))
  // Why: linear scan is fine at this frame count and keeps the lookup obvious.
  let index = 0
  while (index + 1 < starts.length && starts[index + 1]! <= clamped) {
    index += 1
  }
  return index
}

/** Folds every patch up to and including `index` onto the initial state. */
export function stateAtFrame(index: number): DemoState {
  let state = initialState
  for (let i = 0; i <= index && i < frames.length; i += 1) {
    state = { ...state, ...frames[i]!.patch }
  }
  return state
}
