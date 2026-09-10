import type { ShellAgentStartProfilesClient } from '@agentstart/protocol'

export type AgentStartProfileListResult = Awaited<ReturnType<ShellAgentStartProfilesClient['list']>>
export type AgentStartProfileSummary = AgentStartProfileListResult['profiles'][number]
export type CreateLocalAgentStartProfileArgs = NonNullable<
  Parameters<ShellAgentStartProfilesClient['createLocal']>[0]
>
export type CreateLocalAgentStartProfileResult = Awaited<
  ReturnType<ShellAgentStartProfilesClient['createLocal']>
>
export type SwitchAgentStartProfileArgs = Parameters<
  ShellAgentStartProfilesClient['switchProfile']
>[0]
export type SwitchAgentStartProfileResult = Awaited<
  ReturnType<ShellAgentStartProfilesClient['switchProfile']>
>
export type TransferAgentStartProfileProjectArgs = Parameters<
  ShellAgentStartProfilesClient['transferProject']
>[0]
export type TransferAgentStartProfileProjectResult = Awaited<
  ReturnType<ShellAgentStartProfilesClient['transferProject']>
>
export type TransferAgentStartProfileProjectMode = TransferAgentStartProfileProjectArgs['mode']
export type FindAgentStartProfileProjectsByPathArgs = Parameters<
  ShellAgentStartProfilesClient['findProjectProfiles']
>[0]
export type FindAgentStartProfileProjectsByPathResult = Awaited<
  ReturnType<ShellAgentStartProfilesClient['findProjectProfiles']>
>
