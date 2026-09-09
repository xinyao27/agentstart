export function buildImageDataUri(
  mimeType: string | undefined,
  base64Content: string
): string | null {
  // Only image/* renders in an <img>/RN <Image>; reject every other mime
  // (application/pdf, application/octet-stream, …), not just PDF.
  if (!mimeType?.startsWith('image/')) {
    return null
  }
  const cleaned = base64Content.replace(/\s/g, '')
  if (!cleaned) {
    return null
  }
  return `data:${mimeType};base64,${cleaned}`
}
