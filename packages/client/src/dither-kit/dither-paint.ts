// Why: this keeps Dither Kit's MIT-licensed Bayer texture while adapting its canvas engine to
// AgentStart's dependency-free, monochrome chart surface. Source: https://tripwire.sh/dither-kit.
const BAYER_MATRIX = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
].map((row) => row.map((value) => (value + 0.5) / 16))

export function ditherThreshold(x: number, y: number): number {
  return BAYER_MATRIX[y & 3]?.[x & 3] ?? 0
}

export function ditherBackingSize(
  width: number,
  height: number
): {
  columns: number
  rows: number
} {
  return {
    columns: Math.min(520, Math.max(8, Math.round(width / 2))),
    rows: Math.min(200, Math.max(8, Math.round(height / 2)))
  }
}

export function resampleDitherValues(values: number[], length: number): number[] {
  const output = Array.from({ length }, () => 0)
  const lastSourceIndex = Math.max(values.length - 1, 1)
  for (let index = 0; index < length; index++) {
    const sourcePosition = (index / Math.max(length - 1, 1)) * lastSourceIndex
    const firstIndex = Math.floor(sourcePosition)
    const fraction = sourcePosition - firstIndex
    const firstValue = values[firstIndex] ?? 0
    const secondValue = values[Math.min(firstIndex + 1, values.length - 1)] ?? firstValue
    output[index] = firstValue + (secondValue - firstValue) * fraction
  }
  return output
}
