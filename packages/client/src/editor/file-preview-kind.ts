type FilePreviewKind = 'audio' | 'image' | 'pdf' | 'video'

export type FilePreview = {
  kind: FilePreviewKind
  mimeType: string
}

const FILE_PREVIEW_BY_EXTENSION: Readonly<Record<string, FilePreview>> = {
  '.aac': { kind: 'audio', mimeType: 'audio/aac' },
  '.apng': { kind: 'image', mimeType: 'image/apng' },
  '.avif': { kind: 'image', mimeType: 'image/avif' },
  '.bmp': { kind: 'image', mimeType: 'image/bmp' },
  '.flac': { kind: 'audio', mimeType: 'audio/flac' },
  '.gif': { kind: 'image', mimeType: 'image/gif' },
  '.ico': { kind: 'image', mimeType: 'image/x-icon' },
  '.jfif': { kind: 'image', mimeType: 'image/jpeg' },
  '.jpeg': { kind: 'image', mimeType: 'image/jpeg' },
  '.jpg': { kind: 'image', mimeType: 'image/jpeg' },
  '.m4a': { kind: 'audio', mimeType: 'audio/mp4' },
  '.m4v': { kind: 'video', mimeType: 'video/mp4' },
  '.mkv': { kind: 'video', mimeType: 'video/x-matroska' },
  '.mov': { kind: 'video', mimeType: 'video/quicktime' },
  '.mp3': { kind: 'audio', mimeType: 'audio/mpeg' },
  '.mp4': { kind: 'video', mimeType: 'video/mp4' },
  '.oga': { kind: 'audio', mimeType: 'audio/ogg' },
  '.ogg': { kind: 'audio', mimeType: 'audio/ogg' },
  '.ogv': { kind: 'video', mimeType: 'video/ogg' },
  '.opus': { kind: 'audio', mimeType: 'audio/ogg' },
  '.pdf': { kind: 'pdf', mimeType: 'application/pdf' },
  '.png': { kind: 'image', mimeType: 'image/png' },
  '.svg': { kind: 'image', mimeType: 'image/svg+xml' },
  '.wav': { kind: 'audio', mimeType: 'audio/wav' },
  '.webm': { kind: 'video', mimeType: 'video/webm' },
  '.webp': { kind: 'image', mimeType: 'image/webp' }
}

export function getFilePreview(filePath: string): FilePreview | null {
  const basename = filePath.split(/[/\\]/).pop() ?? filePath
  const dotIndex = basename.lastIndexOf('.')
  if (dotIndex <= 0) {
    return null
  }
  return FILE_PREVIEW_BY_EXTENSION[basename.slice(dotIndex).toLowerCase()] ?? null
}
