import {
  isUtf8ByteLengthOverLimit,
  getUtf8ByteLengthForCodePoint
} from '@yiru/protocol/text/utf8-length'
import type { Utf8ByteLengthMeasurement } from '@yiru/protocol/text/utf8-length'
import { yieldToEventLoop } from '~renderer/event-loop-yield'
import { translate } from '~renderer/i18n/i18n'

export const CLIPBOARD_TEXT_READ_MAX_BYTES = 16 * 1024 * 1024
export const CLIPBOARD_TEXT_WRITE_MAX_BYTES = 16 * 1024 * 1024
export const CLIPBOARD_TEXT_TOO_LARGE_ERROR = 'Clipboard text is too large for this paste target.'
export const CLIPBOARD_TEXT_WRITE_TOO_LARGE_ERROR = 'Clipboard text is too large to copy safely.'
export const CLIPBOARD_TEXT_MEASURE_YIELD_CODE_UNITS = 256 * 1024

export type ReadClipboardTextOptions = {
  maxBytes?: number
}

export type WriteClipboardTextOptions = {
  maxBytes?: number
}

export async function measureUtf8ByteLengthWithYield(
  text: string,
  options: {
    stopAfterBytes?: number
    yieldAfterCodeUnits?: number
    yieldToEventLoop?: () => Promise<void>
  } = {}
): Promise<Utf8ByteLengthMeasurement> {
  const stopAfterBytes = options.stopAfterBytes
  const yieldAfterCodeUnits = Math.max(
    1,
    options.yieldAfterCodeUnits ?? CLIPBOARD_TEXT_MEASURE_YIELD_CODE_UNITS
  )
  const yieldBetweenBatches = options.yieldToEventLoop ?? yieldToEventLoop
  let nextYieldAt = yieldAfterCodeUnits
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
    if (index >= nextYieldAt) {
      await yieldBetweenBatches()
      nextYieldAt = index + yieldAfterCodeUnits
    }
  }
  return { byteLength, exceededLimit: false }
}

export async function isUtf8ByteLengthOverLimitWithYield(
  text: string,
  maxBytes: number,
  options: {
    yieldAfterCodeUnits?: number
    yieldToEventLoop?: () => Promise<void>
  } = {}
): Promise<boolean> {
  if (text.length > maxBytes) {
    return true
  }
  return (
    await measureUtf8ByteLengthWithYield(text, {
      stopAfterBytes: maxBytes,
      yieldAfterCodeUnits: options.yieldAfterCodeUnits,
      yieldToEventLoop: options.yieldToEventLoop
    })
  ).exceededLimit
}

export function getClipboardTextReadMaxBytes(
  options: ReadClipboardTextOptions | undefined,
  fallback = CLIPBOARD_TEXT_READ_MAX_BYTES
): number {
  return Number.isFinite(options?.maxBytes) && (options?.maxBytes ?? 0) > 0
    ? Math.floor(options?.maxBytes ?? fallback)
    : fallback
}

export function getClipboardTextWriteMaxBytes(
  options: WriteClipboardTextOptions | undefined,
  fallback = CLIPBOARD_TEXT_WRITE_MAX_BYTES
): number {
  return Number.isFinite(options?.maxBytes) && (options?.maxBytes ?? 0) > 0
    ? Math.floor(options?.maxBytes ?? fallback)
    : fallback
}

export function assertClipboardTextWithinLimit(
  text: string,
  options?: ReadClipboardTextOptions
): string {
  const maxBytes = getClipboardTextReadMaxBytes(options)
  if (isUtf8ByteLengthOverLimit(text, maxBytes)) {
    throw new Error(
      translate('clipboard.read-too-large', 'Clipboard text is too large for this paste target.')
    )
  }
  return text
}

export async function assertClipboardTextWithinLimitWithYield(
  text: string,
  options?: ReadClipboardTextOptions
): Promise<string> {
  const maxBytes = getClipboardTextReadMaxBytes(options)
  if (await isUtf8ByteLengthOverLimitWithYield(text, maxBytes)) {
    throw new Error(
      translate('clipboard.read-too-large', 'Clipboard text is too large for this paste target.')
    )
  }
  return text
}

export function assertClipboardTextWriteWithinLimit(
  text: string,
  options?: WriteClipboardTextOptions
): string {
  const maxBytes = getClipboardTextWriteMaxBytes(options)
  if (isUtf8ByteLengthOverLimit(text, maxBytes)) {
    throw new Error(
      translate('clipboard.write-too-large', 'Clipboard text is too large to copy safely.')
    )
  }
  return text
}

export async function assertClipboardTextWriteWithinLimitWithYield(
  text: string,
  options?: WriteClipboardTextOptions
): Promise<string> {
  const maxBytes = getClipboardTextWriteMaxBytes(options)
  if (await isUtf8ByteLengthOverLimitWithYield(text, maxBytes)) {
    throw new Error(
      translate('clipboard.write-too-large', 'Clipboard text is too large to copy safely.')
    )
  }
  return text
}

export function isClipboardTextTooLargeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes(CLIPBOARD_TEXT_TOO_LARGE_ERROR) ||
      error.message ===
        translate('clipboard.read-too-large', 'Clipboard text is too large for this paste target.'))
  )
}

export function isClipboardTextWriteTooLargeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes(CLIPBOARD_TEXT_WRITE_TOO_LARGE_ERROR) ||
      error.message ===
        translate('clipboard.write-too-large', 'Clipboard text is too large to copy safely.'))
  )
}
