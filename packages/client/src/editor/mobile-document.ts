import type { ShellHostMarkdownSaved } from '@agentstart/protocol/shell-host'
import { getUtf8ByteLength, isUtf8ByteLengthOverLimit } from '@agentstart/protocol/text/utf8-length'

export const MOBILE_MARKDOWN_EDIT_MAX_BYTES = 256 * 1024

type RuntimeMarkdownReadOnlyReason =
  | 'unsupported_preview'
  | 'unsupported_tab'
  | 'unsupported_untitled'
  | 'file_too_large'

export type RuntimeMarkdownReadTabResult = {
  tabId: string
  filePath: string
  relativePath: string
  content: string
  isDirty: boolean
  version: string
  source: 'draft' | 'file'
  editable: boolean
  readOnlyReason?: RuntimeMarkdownReadOnlyReason
}

export type RuntimeMarkdownSaveTabResult = Pick<
  ShellHostMarkdownSaved,
  'tabId' | 'version' | 'content'
> & { isDirty: false }

export function hashMarkdownContent(content: string): string {
  let hash = 0xcbf29ce484222325n
  for (let i = 0; i < content.length; i += 1) {
    hash ^= BigInt(content.charCodeAt(i))
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return `content:${getUtf8ByteLength(content)}:${hash.toString(16).padStart(16, '0')}`
}

export function isMarkdownContentByteLengthOverLimit(content: string, maxBytes: number): boolean {
  return isUtf8ByteLengthOverLimit(content, maxBytes)
}
