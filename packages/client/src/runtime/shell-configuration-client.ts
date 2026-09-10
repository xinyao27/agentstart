import type { KeybindingActionId, KeybindingFileSnapshot } from '@agentstart/protocol/keybindings'
import type {
  CreateLocalAgentStartProfileArgs,
  CreateLocalAgentStartProfileResult,
  FindAgentStartProfileProjectsByPathArgs,
  FindAgentStartProfileProjectsByPathResult,
  SwitchAgentStartProfileArgs,
  SwitchAgentStartProfileResult,
  TransferAgentStartProfileProjectArgs,
  TransferAgentStartProfileProjectResult,
  AgentStartProfileListResult
} from '~renderer/agentstart-profiles/profile-model'

import { requireShellAgentStartProfilesClient } from './shell-agentstart-profiles-target'
import { subscribeShellEvent } from './shell-events-client'
import { keybindingFileSnapshot, requireShellKeybindingsClient } from './shell-keybindings-target'

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

export type ShellAgentStartProfilesApi = {
  list: () => Promise<AgentStartProfileListResult>
  createLocal: (
    args?: CreateLocalAgentStartProfileArgs
  ) => Promise<CreateLocalAgentStartProfileResult>
  switchProfile: (args: SwitchAgentStartProfileArgs) => Promise<SwitchAgentStartProfileResult>
  transferProject: (
    args: TransferAgentStartProfileProjectArgs
  ) => Promise<TransferAgentStartProfileProjectResult>
  findProjectProfiles: (
    args: FindAgentStartProfileProjectsByPathArgs
  ) => Promise<FindAgentStartProfileProjectsByPathResult>
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

export const shellAgentStartProfilesApi: ShellAgentStartProfilesApi = {
  list: async () => (await requireShellAgentStartProfilesClient()).list(),
  createLocal: async (args) => (await requireShellAgentStartProfilesClient()).createLocal(args),
  switchProfile: async (args) => (await requireShellAgentStartProfilesClient()).switchProfile(args),
  transferProject: async (args) =>
    (await requireShellAgentStartProfilesClient()).transferProject(args),
  findProjectProfiles: async (args) =>
    (await requireShellAgentStartProfilesClient()).findProjectProfiles(args)
}
