export type Utf8ByteLengthMeasurement = {
  byteLength: number
  exceededLimit: boolean
}

export function measureUtf8ByteLength(
  text: string,
  options: { stopAfterBytes?: number } = {}
): Utf8ByteLengthMeasurement {
  const stopAfterBytes = options.stopAfterBytes
  let byteLength = 0
  for (let index = 0; index < text.length; index += 1) {
    const codePoint = text.codePointAt(index) ?? 0
    byteLength += getUtf8ByteLengthForCodePoint(codePoint)
    if (Number.isFinite(stopAfterBytes) && byteLength > (stopAfterBytes ?? 0)) {
      return { byteLength, exceededLimit: true }
    }
    if (codePoint > 0xffff) {
      index += 1
    }
  }
  return { byteLength, exceededLimit: false }
}

export function getUtf8ByteLength(text: string): number {
  return measureUtf8ByteLength(text).byteLength
}

export function isUtf8ByteLengthOverLimit(text: string, maxBytes: number): boolean {
  return (
    text.length > maxBytes ||
    measureUtf8ByteLength(text, { stopAfterBytes: maxBytes }).exceededLimit
  )
}

export function getUtf8ByteLengthForCodePoint(codePoint: number): number {
  if (codePoint <= 0x7f) {
    return 1
  }
  if (codePoint <= 0x7ff) {
    return 2
  }
  if (codePoint <= 0xffff) {
    return 3
  }
  return 4
}
