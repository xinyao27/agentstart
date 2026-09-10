import type { RepoHookSettingsValue as RepoHookSettings } from '@agentstart/protocol'
import type { Repo } from '@agentstart/protocol/project/repository'
import { useEffect, useRef, useState } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'

import {
  areHookSettingsDraftsEqual,
  getHookSettingsDraft,
  type HookSettingsPolicyDraft,
  type LocalHookName
} from './hook-settings-model'

export function useRepositoryHookSettingsDraft({
  repo,
  repoHostIdentity,
  onUpdateHookSettings
}: {
  repo: Repo
  repoHostIdentity: string
  onUpdateHookSettings: (settings: RepoHookSettings) => void
}): {
  hookSettingsDraft: RepoHookSettings
  updateScriptDraft: (hookName: LocalHookName, nextScript: string) => void
  commitScriptDraft: () => void
  flushScriptDraftOnUnmount: (node: HTMLElement | null) => void
  updateHookSettingsPolicyDraft: (updates: HookSettingsPolicyDraft) => void
} {
  const [hookSettingsDraft, setHookSettingsDraft] = useState(() =>
    getHookSettingsDraft(repo.hookSettings)
  )
  const draftRef = useRef(hookSettingsDraft)
  const repoIdentityRef = useRef(repoHostIdentity)
  const dirtyRef = useRef(false)
  const autosaveTimerRef = useRef<number | null>(null)
  const persistRef = useRef(onUpdateHookSettings)
  const persistForRepoRef = useRef(onUpdateHookSettings)

  useEffect(() => {
    draftRef.current = hookSettingsDraft
    persistRef.current = onUpdateHookSettings
  }, [hookSettingsDraft, onUpdateHookSettings])

  const syncDraft = useEventCallback((next: RepoHookSettings) => {
    if (!areHookSettingsDraftsEqual(draftRef.current, next)) {
      draftRef.current = next
      setHookSettingsDraft(next)
    }
  })

  const persistDraft = (next: RepoHookSettings) => {
    draftRef.current = next
    setHookSettingsDraft(next)
    dirtyRef.current = false
    persistRef.current(next)
  }

  const clearAutosaveTimer = () => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
  }

  const flushScriptDraft = useEventCallback((persist?: (settings: RepoHookSettings) => void) => {
    clearAutosaveTimer()
    if (!dirtyRef.current) {
      return
    }
    dirtyRef.current = false
    ;(persist ?? persistRef.current)(draftRef.current)
  })

  const queueScriptDraftPersist = () => {
    dirtyRef.current = true
    clearAutosaveTimer()
    // Why: persistence may cross SSH; coalesce typing instead of sending every character.
    autosaveTimerRef.current = window.setTimeout(flushScriptDraft, 700)
  }

  const updateScriptDraft = (hookName: LocalHookName, nextScript: string) => {
    const current = draftRef.current
    const next: RepoHookSettings = {
      ...current,
      scripts: { ...current.scripts, [hookName]: nextScript }
    }
    draftRef.current = next
    setHookSettingsDraft(next)
    queueScriptDraftPersist()
  }

  const commitScriptDraft = () => flushScriptDraft()
  const flushScriptDraftOnUnmount = (node: HTMLElement | null) => {
    if (node === null) {
      flushScriptDraft()
    }
  }
  const updateHookSettingsPolicyDraft = (updates: HookSettingsPolicyDraft) =>
    persistDraft({ ...draftRef.current, ...updates })

  // Why: a repository switch can unmount inputs before blur, so save through the prior updater.
  useEffect(() => {
    const next = getHookSettingsDraft(repo.hookSettings)
    if (repoIdentityRef.current === repoHostIdentity) {
      persistForRepoRef.current = onUpdateHookSettings
      if (!dirtyRef.current) {
        syncDraft(next)
      }
      return
    }
    flushScriptDraft(persistForRepoRef.current)
    repoIdentityRef.current = repoHostIdentity
    persistForRepoRef.current = onUpdateHookSettings
    draftRef.current = next
    setHookSettingsDraft(next)
  }, [flushScriptDraft, onUpdateHookSettings, repo.hookSettings, repoHostIdentity, syncDraft])

  return {
    hookSettingsDraft,
    updateScriptDraft,
    commitScriptDraft,
    flushScriptDraftOnUnmount,
    updateHookSettingsPolicyDraft
  }
}
