import type { KeybindingActionId, KeybindingFileSnapshot } from '@yiru/protocol/keybindings'
import type {
  CreateLocalYiruProfileArgs,
  CreateLocalYiruProfileResult,
  FindYiruProfileProjectsByPathArgs,
  FindYiruProfileProjectsByPathResult,
  SwitchYiruProfileArgs,
  SwitchYiruProfileResult,
  TransferYiruProfileProjectArgs,
  TransferYiruProfileProjectResult,
  YiruProfileListResult
} from '~renderer/yiru-profiles/profile-model'

import { subscribeShellEvent } from './shell-events-client'
import { keybindingFileSnapshot, requireShellKeybindingsClient } from './shell-keybindings-target'
import { requireShellYiruProfilesClient } from './shell-yiru-profiles-target'

export type ShellKeybindingsApi = {
  get: () => Promise<KeybindingFileSnapshot>
  ensureFile: () => Promise<KeybindingFileSnapshot>
  setAction: (args: {
    actionId: KeybindingActionId
    bindings: string[] | null
  }) => Promise<KeybindingFileSnapshot>
  reload: () => Promise<KeybindingFileSnapshot>
  openFile: () => Promise<KeybindingFileSnapshot>
  revealFile: () => Promise<KeybindingFileSnapshot>
  onChanged: (callback: (snapshot: KeybindingFileSnapshot) => void) => () => void
}

export type ShellYiruProfilesApi = {
  list: () => Promise<YiruProfileListResult>
  createLocal: (args?: CreateLocalYiruProfileArgs) => Promise<CreateLocalYiruProfileResult>
  switchProfile: (args: SwitchYiruProfileArgs) => Promise<SwitchYiruProfileResult>
  transferProject: (
    args: TransferYiruProfileProjectArgs
  ) => Promise<TransferYiruProfileProjectResult>
  findProjectProfiles: (
    args: FindYiruProfileProjectsByPathArgs
  ) => Promise<FindYiruProfileProjectsByPathResult>
}

export const shellKeybindingsApi: ShellKeybindingsApi = {
  get: async () => keybindingFileSnapshot(await (await requireShellKeybindingsClient()).get()),
  ensureFile: async () =>
    keybindingFileSnapshot(await (await requireShellKeybindingsClient()).ensureFile()),
  setAction: async (args) =>
    keybindingFileSnapshot(
      await (
        await requireShellKeybindingsClient()
      ).setAction({
        actionId: args.actionId,
        bindings: args.bindings
      })
    ),
  reload: async () =>
    keybindingFileSnapshot(await (await requireShellKeybindingsClient()).reload()),
  openFile: async () =>
    keybindingFileSnapshot(await (await requireShellKeybindingsClient()).openFile()),
  revealFile: async () =>
    keybindingFileSnapshot(await (await requireShellKeybindingsClient()).revealFile()),
  onChanged: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'keybindingsChanged') {
        callback(keybindingFileSnapshot(event.snapshot))
      }
    })
}

export const shellYiruProfilesApi: ShellYiruProfilesApi = {
  list: async () => (await requireShellYiruProfilesClient()).list(),
  createLocal: async (args) => (await requireShellYiruProfilesClient()).createLocal(args),
  switchProfile: async (args) => (await requireShellYiruProfilesClient()).switchProfile(args),
  transferProject: async (args) => (await requireShellYiruProfilesClient()).transferProject(args),
  findProjectProfiles: async (args) =>
    (await requireShellYiruProfilesClient()).findProjectProfiles(args)
}
