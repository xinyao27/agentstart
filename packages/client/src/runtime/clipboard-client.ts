import { CLIPBOARD_IMAGE_UPLOAD_CHUNK_BASE64_CHARS } from '~renderer/clipboard/image-limits'

import { requireClipboardClient } from './clipboard-target'
import { shellClient } from './shell-client'

const CLIPBOARD_IMAGE_SAVE_TIMEOUT_MS = 30_000

export async function saveLocalClipboardImageAsTempFile(): Promise<string | null> {
  const contentBase64 = await shellClient.ui.readClipboardImageBase64()
  if (!contentBase64) {
    return null
  }

  const clipboard = await requireClipboardClient({ kind: 'local' })
  const signal = AbortSignal.timeout(CLIPBOARD_IMAGE_SAVE_TIMEOUT_MS)
  let uploadId: string | null = null
  try {
    uploadId = await clipboard.startImageUpload(contentBase64.length, { signal })
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
    if (uploadId) {
      await clipboard
        .abortImageUpload(uploadId, { signal: AbortSignal.timeout(1_000) })
        .catch(() => {})
    }
    throw error
  }
}
