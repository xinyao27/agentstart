import { CLIPBOARD_IMAGE_UPLOAD_CHUNK_BASE64_CHARS } from '~renderer/clipboard/image-limits'
import {
  CLIPBOARD_IMAGE_MAX_BASE64_CHARS,
  CLIPBOARD_IMAGE_MAX_SOURCE_BYTES,
  clipboardImageTooLargeMessage,
  assertClipboardImageByteLengthWithinLimit,
  assertClipboardImageDimensionsWithinLimit
} from '~renderer/clipboard/image-limits'

import { requireClipboardClient } from './clipboard-target'

const CLIPBOARD_IMAGE_SAVE_TIMEOUT_MS = 30_000

function assertImageBlobWithinLimit(blob: Blob): void {
  assertClipboardImageByteLengthWithinLimit(blob.size)
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error(clipboardImageTooLargeMessage()))
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error(clipboardImageTooLargeMessage()))
        return
      }
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })
}

async function convertImageBlobToPng(blob: Blob): Promise<Blob> {
  assertImageBlobWithinLimit(blob)
  const bitmap = await createImageBitmap(blob)
  try {
    assertClipboardImageDimensionsWithinLimit({ width: bitmap.width, height: bitmap.height })
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error(clipboardImageTooLargeMessage())
    }
    context.drawImage(bitmap, 0, 0)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((png) => {
        if (!png) {
          reject(new Error(clipboardImageTooLargeMessage()))
          return
        }
        try {
          assertImageBlobWithinLimit(png)
          resolve(png)
        } catch (error) {
          reject(error)
        }
      }, 'image/png')
    })
  } finally {
    bitmap.close()
  }
}

export async function readBrowserClipboardImageBase64(): Promise<string | null> {
  const clipboard = navigator.clipboard as
    | (Clipboard & { read?: () => Promise<ClipboardItem[]> })
    | undefined
  if (!clipboard?.read) {
    return null
  }
  const items = await clipboard.read()
  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith('image/'))
    if (!imageType) {
      continue
    }
    const source = await item.getType(imageType)
    if (source.size > CLIPBOARD_IMAGE_MAX_SOURCE_BYTES) {
      throw new Error(clipboardImageTooLargeMessage())
    }
    const png = imageType === 'image/png' ? source : await convertImageBlobToPng(source)
    return blobToBase64(png)
  }
  return null
}

export async function writeBrowserClipboardImage(dataUrl: string): Promise<void> {
  const blob = await (await fetch(dataUrl)).blob()
  assertImageBlobWithinLimit(blob)
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    return
  }
  await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })])
}

export async function saveBrowserClipboardImageAsTempFile(args?: {
  connectionId?: string | null
  runtimeEnvironmentId?: string | null
}): Promise<string | null> {
  const contentBase64 = await readBrowserClipboardImageBase64()
  if (!contentBase64) {
    return null
  }
  if (contentBase64.length > CLIPBOARD_IMAGE_MAX_BASE64_CHARS) {
    throw new Error(clipboardImageTooLargeMessage())
  }
  const target = args?.runtimeEnvironmentId?.trim()
    ? { kind: 'environment' as const, environmentId: args.runtimeEnvironmentId.trim() }
    : { kind: 'local' as const }
  // Why: args.connectionId is dead — the save always lands on the host that
  // owns the target, and nothing has set it since remote hosts were removed.
  const clipboard = await requireClipboardClient(target)
  const signal = AbortSignal.timeout(CLIPBOARD_IMAGE_SAVE_TIMEOUT_MS)
  const uploadId = await clipboard.startImageUpload(contentBase64.length, { signal })

  try {
    for (
      let offset = 0;
      offset < contentBase64.length;
      offset += CLIPBOARD_IMAGE_UPLOAD_CHUNK_BASE64_CHARS
    ) {
      await clipboard.appendImageUploadChunk(
        {
          uploadId,
          offset,
          contentBase64: contentBase64.slice(
            offset,
            offset + CLIPBOARD_IMAGE_UPLOAD_CHUNK_BASE64_CHARS
          )
        },
        { signal }
      )
    }
    return await clipboard.commitImageUpload(uploadId, { signal })
  } catch (error) {
    await clipboard
      .abortImageUpload(uploadId, { signal: AbortSignal.timeout(1_000) })
      .catch(() => {})
    throw error
  }
}
