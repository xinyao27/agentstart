import type { ShellYiruProfilesClient } from '@yiru/protocol'

export type YiruProfileListResult = Awaited<ReturnType<ShellYiruProfilesClient['list']>>
export type YiruProfileSummary = YiruProfileListResult['profiles'][number]
export type CreateLocalYiruProfileArgs = NonNullable<
  Parameters<ShellYiruProfilesClient['createLocal']>[0]
>
export type CreateLocalYiruProfileResult = Awaited<
  ReturnType<ShellYiruProfilesClient['createLocal']>
>
export type SwitchYiruProfileArgs = Parameters<ShellYiruProfilesClient['switchProfile']>[0]
export type SwitchYiruProfileResult = Awaited<ReturnType<ShellYiruProfilesClient['switchProfile']>>
export type TransferYiruProfileProjectArgs = Parameters<
  ShellYiruProfilesClient['transferProject']
>[0]
export type TransferYiruProfileProjectResult = Awaited<
  ReturnType<ShellYiruProfilesClient['transferProject']>
>
export type TransferYiruProfileProjectMode = TransferYiruProfileProjectArgs['mode']
export type FindYiruProfileProjectsByPathArgs = Parameters<
  ShellYiruProfilesClient['findProjectProfiles']
>[0]
export type FindYiruProfileProjectsByPathResult = Awaited<
  ReturnType<ShellYiruProfilesClient['findProjectProfiles']>
>
export type YiruProfileProjectPresence = FindYiruProfileProjectsByPathResult['projects'][number]
