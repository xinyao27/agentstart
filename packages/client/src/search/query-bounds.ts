import { isUtf8ByteLengthOverLimit } from '@yiru/protocol/text/utf8-length'

export const FIND_QUERY_MAX_BYTES = 2 * 1024

export function isFindQueryTooLarge(query: string, maxBytes = FIND_QUERY_MAX_BYTES): boolean {
  return isUtf8ByteLengthOverLimit(query, maxBytes)
}

export function getFindRequestQuery(query: string): string | null {
  return isFindQueryTooLarge(query) ? null : query
}
