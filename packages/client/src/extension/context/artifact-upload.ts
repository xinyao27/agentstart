import { requireArtifactClient } from '~renderer/runtime/artifact-target'

export async function uploadBrowserArtifact(input: {
  blob: Blob
  fileName: string
  projectId: string
}): Promise<string> {
  const client = await requireArtifactClient()
  const artifact = await client.begin({
    fileName: input.fileName,
    mimeType: input.blob.type || 'application/octet-stream',
    projectId: input.projectId
  })
  try {
    let offset = 0
    while (offset < input.blob.size) {
      const bytes = new Uint8Array(
        await input.blob.slice(offset, offset + 384 * 1_024).arrayBuffer()
      )
      await client.append({ dataBase64: bytesToBase64(bytes), id: artifact.id, offset })
      offset += bytes.byteLength
    }
    await client.complete(artifact.id)
    return artifact.id
  } catch (error) {
    await client.abort(artifact.id).catch(() => {})
    throw error
  }
}

export async function readBrowserArtifact(id: string): Promise<Blob> {
  const client = await requireArtifactClient()
  const chunks: ArrayBuffer[] = []
  let offset = 0
  let mimeType = 'application/octet-stream'
  while (true) {
    const page = await client.read({ id, limit: 384 * 1_024, offset })
    const bytes = base64ToBytes(page.dataBase64)
    chunks.push(bytes.buffer)
    mimeType = page.mimeType
    if (page.eof) {
      return new Blob(chunks, { type: mimeType })
    }
    if (page.nextOffset <= offset) {
      throw new Error('artifact_read_did_not_advance')
    }
    offset = page.nextOffset
  }
}

export function pngDataUrlToBlob(dataUrl: string): Blob {
  const prefix = 'data:image/png;base64,'
  if (!dataUrl.startsWith(prefix)) {
    throw new Error('visual_capture_invalid_png_data_url')
  }
  return new Blob([base64ToBytes(dataUrl.slice(prefix.length)).buffer], { type: 'image/png' })
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.byteLength; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}
