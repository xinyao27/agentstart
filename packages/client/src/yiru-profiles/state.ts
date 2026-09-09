import type { StateCreator } from 'zustand'
import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'
import { shellClient } from '~renderer/runtime/shell-client'
import type { AppState } from '~renderer/store/types'
import type {
  YiruProfileSummary,
  SwitchYiruProfileResult,
  TransferYiruProfileProjectArgs,
  TransferYiruProfileProjectResult
} from '~renderer/yiru-profiles/profile-model'

export type YiruProfilesSlice = {
  yiruProfiles: YiruProfileSummary[]
  activeYiruProfileId: string | null
  yiruProfilesMultiProfileUi: boolean
  yiruProfilesLoading: boolean
  yiruProfileSwitching: boolean
  fetchYiruProfiles: () => Promise<void>
  createLocalYiruProfile: (name?: string) => Promise<YiruProfileSummary | null>
  switchYiruProfile: (profileId: string) => Promise<SwitchYiruProfileResult | null>
  transferYiruProfileProject: (
    args: TransferYiruProfileProjectArgs
  ) => Promise<TransferYiruProfileProjectResult | null>
}

export const createYiruProfilesSlice: StateCreator<AppState, [], [], YiruProfilesSlice> = (
  set,
  get
) => ({
  yiruProfiles: [],
  activeYiruProfileId: null,
  yiruProfilesMultiProfileUi: false,
  yiruProfilesLoading: false,
  yiruProfileSwitching: false,

  fetchYiruProfiles: async () => {
    set({ yiruProfilesLoading: true })
    try {
      const state = await shellClient.yiruProfiles.list()
      set({
        activeYiruProfileId: state.activeProfileId,
        yiruProfiles: state.profiles,
        yiruProfilesMultiProfileUi: state.multiProfileUi,
        yiruProfilesLoading: false
      })
    } catch (err) {
      console.error('Failed to fetch Yiru profiles:', err)
      set({ yiruProfilesLoading: false })
    }
  },

  createLocalYiruProfile: async (name) => {
    try {
      const state = await shellClient.yiruProfiles.createLocal({ name })
      set({
        activeYiruProfileId: state.activeProfileId,
        yiruProfiles: state.profiles
      })
      return state.profile
    } catch (err) {
      console.error('Failed to create Yiru profile:', err)
      publishRendererCommandResult({
        type: 'yiru-profile',
        operation: 'create-local',
        outcome: 'failed',
        error: err instanceof Error ? err.message : String(err)
      })
      return null
    }
  },

  switchYiruProfile: async (profileId) => {
    if (!profileId || profileId === get().activeYiruProfileId) {
      return { status: 'already-active' }
    }
    set({ yiruProfileSwitching: true })
    try {
      const result = await shellClient.yiruProfiles.switchProfile({ profileId })
      if (result?.status !== 'relaunching') {
        // Why: only a relaunch may keep the switcher locked; a stale
        // "already-active" answer would otherwise disable it forever.
        set({ yiruProfileSwitching: false })
      }
      return result
    } catch (err) {
      console.error('Failed to switch Yiru profile:', err)
      set({ yiruProfileSwitching: false })
      publishRendererCommandResult({
        type: 'yiru-profile',
        operation: 'switch',
        outcome: 'failed',
        error: err instanceof Error ? err.message : String(err)
      })
      return null
    }
  },

  transferYiruProfileProject: async (args) => {
    try {
      const result = await shellClient.yiruProfiles.transferProject(args)
      if (result.status === 'duplicate-target') {
        publishRendererCommandResult({
          type: 'yiru-profile',
          operation: 'transfer',
          outcome: 'duplicate-target'
        })
      }
      if (result.status === 'transferred' && result.willRelaunch) {
        set({ yiruProfileSwitching: true })
      }
      return result
    } catch (err) {
      console.error('Failed to transfer Yiru profile project:', err)
      publishRendererCommandResult({
        type: 'yiru-profile',
        operation: 'transfer',
        outcome: 'failed',
        error: err instanceof Error ? err.message : String(err)
      })
      return null
    }
  }
})
