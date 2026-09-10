import { measureUtf8ByteLength } from '@agentstart/protocol/text/utf8-length'
import {
  CLIPBOARD_TEXT_MEASURE_YIELD_CODE_UNITS,
  isUtf8ByteLengthOverLimitWithYield
} from '~renderer/clipboard/text'

export const TERMINAL_INPUT_CHUNK_MAX_BYTES = 16 * 1024
export const TERMINAL_INPUT_MAX_BYTES = 16 * 1024 * 1024

export function getTerminalInputByteLength(text: string): number {
  return measureUtf8ByteLength(text).byteLength
}

function getUtf8ByteLengthForCodePoint(codePoint: number): number {
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

function isTerminalInputTooLarge(text: string, maxBytes = TERMINAL_INPUT_MAX_BYTES): boolean {
  return (
    text.length > maxBytes ||
    measureUtf8ByteLength(text, { stopAfterBytes: maxBytes }).exceededLimit
  )
}

function isTerminalInputTooLargeWithYield(
  text: string,
  maxBytes = TERMINAL_INPUT_MAX_BYTES
): Promise<boolean> {
  return isUtf8ByteLengthOverLimitWithYield(text, maxBytes)
}

export function isTerminalInputTooLargeWithDeferredMeasurement(
  text: string,
  maxBytes = TERMINAL_INPUT_MAX_BYTES
): boolean | Promise<boolean> {
  if (text.length > maxBytes) {
    return true
  }
  if (text.length > CLIPBOARD_TEXT_MEASURE_YIELD_CODE_UNITS) {
    return isTerminalInputTooLargeWithYield(text, maxBytes)
  }
  return isTerminalInputTooLarge(text, maxBytes)
}

export function* iterateTerminalInputChunks(
  text: string,
  maxChunkBytes = TERMINAL_INPUT_CHUNK_MAX_BYTES
): Generator<string> {
  if (text.length === 0) {
    return
  }
  const normalizedMax = Number.isFinite(maxChunkBytes) && maxChunkBytes > 0 ? maxChunkBytes : 1
  const measurement = measureUtf8ByteLength(text, { stopAfterBytes: normalizedMax })
  if (!measurement.exceededLimit) {
    yield text
    return
  }

  let currentStart = 0
  let currentBytes = 0
  let index = 0
  while (index < text.length) {
    const codePoint = text.codePointAt(index) ?? 0
    const codeUnitLength = codePoint > 0xffff ? 2 : 1
    const nextIndex = index + codeUnitLength
    const characterBytes = getUtf8ByteLengthForCodePoint(codePoint)
    if (currentBytes > 0 && currentBytes + characterBytes > normalizedMax) {
      yield text.slice(currentStart, index)
      currentStart = index
      currentBytes = 0
    }
    currentBytes += characterBytes
    index = nextIndex
  }
  if (currentStart < text.length) {
    yield text.slice(currentStart)
  }
}
