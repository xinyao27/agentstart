import type { StateCreator } from 'zustand'
import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'
import { shellClient } from '~renderer/runtime/shell-client'
import type { AppState } from '~renderer/store/types'

import type {
  AgentStartProfileSummary,
  SwitchAgentStartProfileResult,
  TransferAgentStartProfileProjectArgs,
  TransferAgentStartProfileProjectResult
} from './profile-model'

export type AgentStartProfilesSlice = {
  agentstartProfiles: AgentStartProfileSummary[]
  activeAgentStartProfileId: string | null
  agentstartProfilesMultiProfileUi: boolean
  agentstartProfilesLoading: boolean
  agentstartProfileSwitching: boolean
  fetchAgentStartProfiles: () => Promise<void>
  createLocalAgentStartProfile: (name?: string) => Promise<AgentStartProfileSummary | null>
  switchAgentStartProfile: (profileId: string) => Promise<SwitchAgentStartProfileResult | null>
  transferAgentStartProfileProject: (
    args: TransferAgentStartProfileProjectArgs
  ) => Promise<TransferAgentStartProfileProjectResult | null>
}

export const createAgentStartProfilesSlice: StateCreator<
  AppState,
  [],
  [],
  AgentStartProfilesSlice
> = (set, get) => ({
  agentstartProfiles: [],
  activeAgentStartProfileId: null,
  agentstartProfilesMultiProfileUi: false,
  agentstartProfilesLoading: false,
  agentstartProfileSwitching: false,

  fetchAgentStartProfiles: async () => {
    set({ agentstartProfilesLoading: true })
    try {
      const state = await shellClient.agentstartProfiles.list()
      set({
        activeAgentStartProfileId: state.activeProfileId,
        agentstartProfiles: state.profiles,
        agentstartProfilesMultiProfileUi: state.multiProfileUi,
        agentstartProfilesLoading: false
      })
    } catch (err) {
      console.error('Failed to fetch AgentStart profiles:', err)
      set({ agentstartProfilesLoading: false })
    }
  },

  createLocalAgentStartProfile: async (name) => {
    try {
      const state = await shellClient.agentstartProfiles.createLocal({ name })
      set({
        activeAgentStartProfileId: state.activeProfileId,
        agentstartProfiles: state.profiles
      })
      return state.profile
    } catch (err) {
      console.error('Failed to create AgentStart profile:', err)
      publishRendererCommandResult({
        type: 'agentstart-profile',
        operation: 'create-local',
        outcome: 'failed',
        error: err instanceof Error ? err.message : String(err)
      })
      return null
    }
  },

  switchAgentStartProfile: async (profileId) => {
    if (!profileId || profileId === get().activeAgentStartProfileId) {
      return { status: 'already-active' }
    }
    set({ agentstartProfileSwitching: true })
    try {
      const result = await shellClient.agentstartProfiles.switchProfile({ profileId })
      if (result?.status !== 'relaunching') {
        // Why: only a relaunch may keep the switcher locked; a stale
        // "already-active" answer would otherwise disable it forever.
        set({ agentstartProfileSwitching: false })
      }
      return result
    } catch (err) {
      console.error('Failed to switch AgentStart profile:', err)
      set({ agentstartProfileSwitching: false })
      publishRendererCommandResult({
        type: 'agentstart-profile',
        operation: 'switch',
        outcome: 'failed',
        error: err instanceof Error ? err.message : String(err)
      })
      return null
    }
  },

  transferAgentStartProfileProject: async (args) => {
    try {
      const result = await shellClient.agentstartProfiles.transferProject(args)
      if (result.status === 'duplicate-target') {
        publishRendererCommandResult({
          type: 'agentstart-profile',
          operation: 'transfer',
          outcome: 'duplicate-target'
        })
      }
      if (result.status === 'transferred' && result.willRelaunch) {
        set({ agentstartProfileSwitching: true })
      }
      return result
    } catch (err) {
      console.error('Failed to transfer AgentStart profile project:', err)
      publishRendererCommandResult({
        type: 'agentstart-profile',
        operation: 'transfer',
        outcome: 'failed',
        error: err instanceof Error ? err.message : String(err)
      })
      return null
    }
  }
})
