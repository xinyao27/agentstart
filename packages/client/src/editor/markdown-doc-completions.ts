import type { MarkdownDocument } from '@yiru/protocol/files/values'
import { isUtf8ByteLengthOverLimit } from '@yiru/protocol/text/utf8-length'

export const MARKDOWN_DOC_COMPLETION_QUERY_MAX_BYTES = 2 * 1024

export function isMarkdownDocCompletionQueryTooLarge(
  query: string,
  maxBytes = MARKDOWN_DOC_COMPLETION_QUERY_MAX_BYTES
): boolean {
  return isUtf8ByteLengthOverLimit(query, maxBytes)
}

function normalizeCompletionText(value: string): string {
  return value.trim().replaceAll('\\', '/').toLowerCase()
}

export function getMarkdownDocCompletionDocuments(
  documents: MarkdownDocument[],
  partial: string
): MarkdownDocument[] {
  if (isMarkdownDocCompletionQueryTooLarge(partial)) {
    return []
  }

  const normalizedPartial = normalizeCompletionText(partial)
  return documents
    .filter((document) => {
      if (!normalizedPartial) {
        return true
      }
      return (
        normalizeCompletionText(document.name).startsWith(normalizedPartial) ||
        normalizeCompletionText(document.relativePath).startsWith(normalizedPartial)
      )
    })
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}
