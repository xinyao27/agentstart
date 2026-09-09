import { isUtf8ByteLengthOverLimit } from '../../text/utf8-length.js'

export const GITHUB_WORK_ITEMS_QUERY_MAX_BYTES = 8 * 1024

export function isGitHubWorkItemsQueryTooLarge(
  query: string,
  maxBytes = GITHUB_WORK_ITEMS_QUERY_MAX_BYTES
): boolean {
  return isUtf8ByteLengthOverLimit(query, maxBytes)
}
