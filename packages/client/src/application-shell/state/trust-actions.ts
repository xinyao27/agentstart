import type { StateCreator } from 'zustand'
import { setRuntimeUIState } from '~renderer/runtime/ui-client'
import { getSetupScriptPromptDismissalKey } from '~renderer/sidebar/setup-script-prompt'

import type { AppState } from '../../store/types'
import type { UISlice } from './slice'

export function createUITrustActions(
  set: Parameters<StateCreator<AppState, [], [], UISlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], UISlice>>[1]
): Pick<
  UISlice,
  | 'markAgentStartHookScriptConfirmed'
  | 'markAgentStartHookRepoAlwaysTrusted'
  | 'clearAgentStartHookTrustForRepo'
  | 'dismissSetupScriptPrompt'
  | 'setSetupGuideSidebarDismissed'
  | 'markSetupGuideBrowserMilestoneMigrated'
  | 'setBrowserImportHintHidden'
  | 'dismissMobileEmulatorTabIntro'
  | 'dismissMobileEmulatorAgentSetup'
  | 'dismissProjectOrderManualDefaultNotice'
  | 'dismissUsagePercentageDisplayChangeNotice'
  | 'dismissUsageEmptyState'
> {
  return {
    markAgentStartHookScriptConfirmed: (repoId, kind, contentHash) =>
      set((s) => {
        const existing = s.trustedAgentStartHooks[repoId]
        const currentEntry = existing?.[kind]
        if (currentEntry?.contentHash === contentHash) {
          return s
        }
        const nextRepo = {
          ...existing,
          [kind]: { contentHash, approvedAt: Date.now() }
        }
        const next = { ...s.trustedAgentStartHooks, [repoId]: nextRepo }
        setRuntimeUIState(get().settings, { trustedAgentStartHooks: next }).catch(console.error)
        return { trustedAgentStartHooks: next }
      }),
    markAgentStartHookRepoAlwaysTrusted: (repoId) =>
      set((s) => {
        const existing = s.trustedAgentStartHooks[repoId]
        if (existing?.all) {
          return s
        }
        const next = {
          ...s.trustedAgentStartHooks,
          [repoId]: {
            ...existing,
            all: { approvedAt: Date.now() }
          }
        }
        setRuntimeUIState(get().settings, { trustedAgentStartHooks: next }).catch(console.error)
        return { trustedAgentStartHooks: next }
      }),
    clearAgentStartHookTrustForRepo: (repoId) =>
      set((s) => {
        if (!(repoId in s.trustedAgentStartHooks)) {
          return s
        }
        const next = { ...s.trustedAgentStartHooks }
        delete next[repoId]
        setRuntimeUIState(get().settings, { trustedAgentStartHooks: next }).catch(console.error)
        return { trustedAgentStartHooks: next }
      }),
    dismissSetupScriptPrompt: (repoId) =>
      set((s) => {
        const dismissalKey = getSetupScriptPromptDismissalKey(repoId)
        if (!repoId || s.setupScriptPromptDismissedRepoIds.includes(dismissalKey)) {
          return s
        }
        const next = [...s.setupScriptPromptDismissedRepoIds, dismissalKey]
        setRuntimeUIState(get().settings, { setupScriptPromptDismissedRepoIds: next }).catch(
          console.error
        )
        return { setupScriptPromptDismissedRepoIds: next }
      }),
    setSetupGuideSidebarDismissed: (dismissed) =>
      set((s) => {
        if (s.setupGuideSidebarDismissed === dismissed) {
          return s
        }
        setRuntimeUIState(get().settings, { setupGuideSidebarDismissed: dismissed }).catch(
          console.error
        )
        return { setupGuideSidebarDismissed: dismissed }
      }),
    markSetupGuideBrowserMilestoneMigrated: (legacyComplete) =>
      set((s) => {
        if (
          s.setupGuideBrowserMilestoneMigrated &&
          s.setupGuideBrowserMilestoneLegacyComplete === legacyComplete
        ) {
          return s
        }
        const updates = {
          setupGuideBrowserMilestoneMigrated: true,
          setupGuideBrowserMilestoneLegacyComplete: legacyComplete
        }
        setRuntimeUIState(get().settings, updates).catch(console.error)
        return updates
      }),
    setBrowserImportHintHidden: (hidden) =>
      set((s) => {
        if (s.browserImportHintHidden === hidden) {
          return s
        }
        setRuntimeUIState(get().settings, { browserImportHintHidden: hidden }).catch(console.error)
        return { browserImportHintHidden: hidden }
      }),
    dismissMobileEmulatorTabIntro: () =>
      set((s) => {
        if (s.mobileEmulatorTabIntroDismissed) {
          return s
        }
        setRuntimeUIState(get().settings, { mobileEmulatorTabIntroDismissed: true }).catch(
          console.error
        )
        return { mobileEmulatorTabIntroDismissed: true }
      }),
    dismissMobileEmulatorAgentSetup: () =>
      set((s) => {
        if (s.mobileEmulatorAgentSetupDismissed) {
          return s
        }
        setRuntimeUIState(get().settings, { mobileEmulatorAgentSetupDismissed: true }).catch(
          console.error
        )
        return { mobileEmulatorAgentSetupDismissed: true }
      }),
    dismissProjectOrderManualDefaultNotice: () =>
      set((s) => {
        if (s.projectOrderManualDefaultNoticeDismissed) {
          return s
        }
        setRuntimeUIState(get().settings, { projectOrderManualDefaultNoticeDismissed: true }).catch(
          console.error
        )
        return { projectOrderManualDefaultNoticeDismissed: true }
      }),
    dismissUsagePercentageDisplayChangeNotice: () =>
      set((s) => {
        if (s.usagePercentageDisplayChangeNoticeDismissed) {
          return s
        }
        setRuntimeUIState(get().settings, {
          usagePercentageDisplayChangeNoticeDismissed: true
        }).catch(console.error)
        return { usagePercentageDisplayChangeNoticeDismissed: true }
      }),
    dismissUsageEmptyState: () =>
      set((s) => {
        if (s.usageEmptyStateDismissed) {
          return s
        }
        setRuntimeUIState(get().settings, { usageEmptyStateDismissed: true }).catch(console.error)
        return { usageEmptyStateDismissed: true }
      })
  }
}
