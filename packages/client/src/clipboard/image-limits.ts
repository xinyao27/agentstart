import { translate } from '~renderer/i18n/i18n'

export const CLIPBOARD_IMAGE_MAX_BASE64_CHARS = 24 * 1024 * 1024
export const CLIPBOARD_IMAGE_UPLOAD_CHUNK_BASE64_CHARS = 512 * 1024
export function clipboardImageTooLargeMessage(): string {
  return translate('clipboard.image.tooLarge', 'Clipboard image is too large')
}

export const CLIPBOARD_IMAGE_MAX_SOURCE_BYTES = Math.floor(
  (CLIPBOARD_IMAGE_MAX_BASE64_CHARS / 4) * 3
)
export const CLIPBOARD_IMAGE_MAX_PIXELS = 32 * 1024 * 1024

export type ClipboardImageDimensions = {
  height: number
  width: number
}

export function assertClipboardImageByteLengthWithinLimit(byteLength: number): void {
  if (!Number.isFinite(byteLength) || byteLength > CLIPBOARD_IMAGE_MAX_SOURCE_BYTES) {
    throw new Error(clipboardImageTooLargeMessage())
  }
}

export function assertClipboardImageDimensionsWithinLimit({
  height,
  width
}: ClipboardImageDimensions): void {
  const pixelCount = width * height
  if (
    !Number.isFinite(pixelCount) ||
    width <= 0 ||
    height <= 0 ||
    pixelCount > CLIPBOARD_IMAGE_MAX_PIXELS
  ) {
    throw new Error(clipboardImageTooLargeMessage())
  }
}
