import type { TuiAgent } from '@agentstart/protocol/agent/types'
import { supportsTerminalAgentQuickCommand } from '@agentstart/protocol/terminal/quick-commands'
import type { AgentCatalogEntry } from '~renderer/agent/catalog'
import { getAgentCatalog } from '~renderer/agent/catalog'

const QUICK_COMMAND_AGENT_PRESENTATION_ORDER = [
  'claude',
  'codex',
  'gemini',
  'copilot',
  'opencode',
  'pi',
  'omp',
  'cursor',
  'droid',
  'command-code',
  'openclaude'
] as const satisfies readonly TuiAgent[]

const QUICK_COMMAND_AGENT_ORDER_RANK = new Map<TuiAgent, number>(
  QUICK_COMMAND_AGENT_PRESENTATION_ORDER.map((agent, index) => [agent, index])
)

export function getTerminalQuickCommandAgentOptions(
  catalog: readonly AgentCatalogEntry[] = getAgentCatalog()
): AgentCatalogEntry[] {
  const catalogOrder = new Map<TuiAgent, number>(catalog.map((entry, index) => [entry.id, index]))

  return [...catalog].sort((a, b) => {
    const aSupported = supportsTerminalAgentQuickCommand(a.id)
    const bSupported = supportsTerminalAgentQuickCommand(b.id)
    if (aSupported !== bSupported) {
      return aSupported ? -1 : 1
    }

    const fallbackRank = QUICK_COMMAND_AGENT_PRESENTATION_ORDER.length
    const aRank = QUICK_COMMAND_AGENT_ORDER_RANK.get(a.id) ?? fallbackRank
    const bRank = QUICK_COMMAND_AGENT_ORDER_RANK.get(b.id) ?? fallbackRank
    if (aRank !== bRank) {
      return aRank - bRank
    }

    return (catalogOrder.get(a.id) ?? 0) - (catalogOrder.get(b.id) ?? 0)
  })
}
