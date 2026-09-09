import { isUtf8ByteLengthOverLimit } from '../../text/utf8-length.js'

export const WORK_ITEM_LINK_QUERY_MAX_BYTES = 2 * 1024

export function isWorkItemLinkQueryTooLarge(
  query: string,
  maxBytes = WORK_ITEM_LINK_QUERY_MAX_BYTES
): boolean {
  return isUtf8ByteLengthOverLimit(query, maxBytes)
}
