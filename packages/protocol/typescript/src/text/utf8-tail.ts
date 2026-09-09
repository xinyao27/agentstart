import { getUtf8ByteLengthForCodePoint } from './utf8-length.js'

export type Utf8TextTail = { text: string; bytes: number }

export function clampUtf8TextTail(text: string, maxBytes: number): Utf8TextTail {
  if (!text || maxBytes <= 0) {
    return { text: '', bytes: 0 }
  }

  let start = text.length
  let bytes = 0
  while (start > 0) {
    const previous = getPreviousUtf8CodePoint(text, start)
    if (previous.bytes > maxBytes || bytes + previous.bytes > maxBytes) {
      break
    }
    bytes += previous.bytes
    start = previous.start
    if (bytes >= maxBytes) {
      break
    }
  }
  return { text: text.slice(start), bytes }
}

function getPreviousUtf8CodePoint(
  text: string,
  endIndex: number
): { start: number; bytes: number } {
  let start = endIndex - 1
  const codeUnit = text.charCodeAt(start)
  const isLowSurrogate = codeUnit >= 0xdc00 && codeUnit <= 0xdfff
  if (isLowSurrogate && start > 0) {
    const previous = text.charCodeAt(start - 1)
    if (previous >= 0xd800 && previous <= 0xdbff) {
      start -= 1
    }
  }
  return {
    start,
    bytes: getUtf8ByteLengthForCodePoint(text.codePointAt(start) ?? codeUnit)
  }
}
