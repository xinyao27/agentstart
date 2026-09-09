export const CUSTOM_AGENT_ID = 'custom' as const
export type CustomAgentId = typeof CUSTOM_AGENT_ID

export function isCustomAgentId(id: string | null | undefined): id is CustomAgentId {
  return id === CUSTOM_AGENT_ID
}
