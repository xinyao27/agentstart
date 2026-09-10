import { isUtf8ByteLengthOverLimit } from '@agentstart/protocol/text/utf8-length'

import type { SlashCommand } from './slash-commands'

const RICH_MARKDOWN_SLASH_COMMAND_QUERY_MAX_BYTES = 2 * 1024

function isRichMarkdownSlashCommandQueryTooLarge(
  query: string,
  maxBytes = RICH_MARKDOWN_SLASH_COMMAND_QUERY_MAX_BYTES
): boolean {
  return isUtf8ByteLengthOverLimit(query, maxBytes)
}

export function filterRichMarkdownSlashCommands(
  commands: readonly SlashCommand[],
  rawQuery: string
): SlashCommand[] {
  if (isRichMarkdownSlashCommandQueryTooLarge(rawQuery)) {
    return []
  }

  const query = rawQuery.trim().toLowerCase()
  if (!query) {
    return [...commands]
  }

  return commands.filter((command) => {
    const haystack = [command.label, ...command.aliases].join(' ').toLowerCase()
    return haystack.includes(query)
  })
}
