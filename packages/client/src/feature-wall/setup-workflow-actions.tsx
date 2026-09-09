import type { RepoHookSettingsValue as RepoHookSettings } from '@yiru/protocol'
import type { Repo } from '@yiru/protocol/project/repository'
import { isGitRepoKind } from '@yiru/protocol/project/repository'
import { getDefaultRepoHookSettings } from '@yiru/protocol/worktree/hooks'
import type { Worktree } from '@yiru/protocol/worktree/model'
import { useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { FloppyDisk as Save, Gear as Settings, ArrowUpRight, Plus } from '~renderer/icons/hugeicons'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useAllWorktrees } from '~renderer/store/selectors'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { Input } from '~renderer/ui/input'

import {
  requestContextualTourWhenReady,
  type RequestContextualTourWhenReadyArgs
} from '../contextual-tours/request-contextual-tour-when-ready'
import { getRepositoryLocalCommandsSectionId } from '../settings/repository/settings-targets'

export const SETUP_GUIDE_PROJECT_PROMPT = "First add a project you'd like to work on."

export function promptForSetupGuideProject(openModal: (modal: 'add-repo') => void): void {
  openModal('add-repo')
  toast.message(SETUP_GUIDE_PROJECT_PROMPT)
}

export function getSetupGuideGitRepo(
  repos: readonly Repo[],
  activeRepoId: string | null
): Repo | null {
  const activeRepo = activeRepoId
    ? repos.find((entry) => entry.id === activeRepoId && isGitRepoKind(entry))
    : undefined
  return activeRepo ?? repos.find((entry) => isGitRepoKind(entry)) ?? null
}

export function AddReposAction(): React.JSX.Element {
  const openModal = useAppStore((s) => s.openModal)
  return (
    <Button type="button" size="sm" className="w-fit gap-2" onClick={() => openModal('add-repo')}>
      <Plus className="size-3.5" />
      {translate(
        'auto.components.feature.wall.FeatureWallSetupWorkflowActions.522cce9e33',
        'Add project'
      )}
    </Button>
  )
}

export function WorkspacesAction(props: { done: boolean }): React.JSX.Element | null {
  const openModal = useAppStore((s) => s.openModal)
  const activeRepoId = useAppStore((s) => s.activeRepoId)
  const { repos } = useProjectCatalog()
  const repo = getSetupGuideGitRepo(repos, activeRepoId)
  if (props.done) {
    return null
  }

  return (
    <Button
      type="button"
      size="sm"
      className="w-fit gap-2"
      onClick={() => {
        cancelPendingSetupGuideTourRequest()
        if (!repo) {
          promptForSetupGuideProject(openModal)
          return
        }
        const tourRequestId = createSetupGuideTourRequestId()
        openModal('new-workspace-composer', {
          initialRepoId: repo.id,
          telemetrySource: 'unknown',
          contextualTourSource: 'setup_guide_parallel_work',
          setupGuideTourRequestId: tourRequestId
        })
        requestSetupGuideTourWhenReady({
          id: 'workspace-creation',
          source: 'setup_guide_parallel_work',
          wasFeaturePreviouslyInteracted: false,
          shouldContinue: () => isSetupGuideWorkspaceComposerRequestCurrent(tourRequestId)
        })
      }}
    >
      <ArrowUpRight className="size-3.5" />
      {translate(
        'auto.components.feature.wall.FeatureWallSetupWorkflowActions.f0bbf7da77',
        'Try it out'
      )}
    </Button>
  )
}

export function SetupScriptAction(): React.JSX.Element {
  const { repos } = useProjectCatalog()
  const activeRepoId = useAppStore((s) => s.activeRepoId)
  const closeModal = useAppStore((s) => s.closeModal)
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const setSettingsSearchQuery = useAppStore((s) => s.setSettingsSearchQuery)
  const updateRepo = useAppStore((s) => s.updateRepo)
  const repo = getSetupGuideGitRepo(repos, activeRepoId)
  const canConfigure = repo !== null
  const setupScriptDefault = repo?.hookSettings?.scripts?.setup?.trim() || 'pnpm install'
  const setupScriptIdentity = repo?.id ?? 'no-repo'
  const [setupScriptDraft, setSetupScriptDraft] = useState({ identity: '', value: '' })
  const setupScript =
    setupScriptDraft.identity === setupScriptIdentity ? setupScriptDraft.value : setupScriptDefault

  const openLocalCommandSettings = () => {
    if (!repo || !isGitRepoKind(repo)) {
      return
    }
    setSettingsSearchQuery('')
    openSettingsTarget({
      pane: 'repo',
      repoId: repo.id,
      sectionId: getRepositoryLocalCommandsSectionId(repo.id)
    })
    closeModal()
    openSettingsPage()
  }

  const handleSaveSetupScript = async () => {
    if (!repo || !isGitRepoKind(repo)) {
      return
    }
    const current = repo.hookSettings
    const defaults = getDefaultRepoHookSettings()
    const nextHookSettings: RepoHookSettings = {
      ...defaults,
      ...current,
      setupRunPolicy: current?.setupRunPolicy ?? defaults.setupRunPolicy,
      // Why: setup guide edits are local repo commands and must run after save.
      commandSourcePolicy: current?.commandSourcePolicy ?? 'local-only',
      scripts: {
        ...defaults.scripts,
        ...current?.scripts,
        setup: setupScript.trim()
      }
    }
    const updated = await updateRepo(repo.id, { hookSettings: nextHookSettings })
    if (updated) {
      toast.success(
        translate(
          'auto.components.feature.wall.FeatureWallSetupWorkflowActions.6299297dac',
          'Setup script saved'
        )
      )
    } else {
      toast.error(
        translate(
          'auto.components.feature.wall.FeatureWallSetupWorkflowActions.a7463915b6',
          'Failed to save setup script'
        )
      )
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid max-w-2xl gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Input
          value={setupScript}
          disabled={!canConfigure}
          onChange={(event) =>
            setSetupScriptDraft({ identity: setupScriptIdentity, value: event.target.value })
          }
          placeholder={translate(
            'auto.components.feature.wall.FeatureWallSetupWorkflowActions.5c5b65044e',
            'pnpm install'
          )}
          aria-label={translate(
            'auto.components.feature.wall.FeatureWallSetupWorkflowActions.88469e926b',
            'Setup script'
          )}
          className="font-mono text-sm"
        />
        <Button
          type="button"
          size="sm"
          className="gap-2"
          disabled={!canConfigure || setupScript.trim().length === 0}
          onClick={() => void handleSaveSetupScript()}
        >
          <Save className="size-3.5" />
          {translate(
            'auto.components.feature.wall.FeatureWallSetupWorkflowActions.14327073cc',
            'Save'
          )}
        </Button>
      </div>
      <Button
        type="button"
        variant="quiet"
        size="sm"
        className="w-fit gap-2 px-0 hover:bg-transparent"
        disabled={!canConfigure}
        onClick={openLocalCommandSettings}
      >
        <Settings className="size-3.5" />
        {translate(
          'auto.components.feature.wall.FeatureWallSetupWorkflowActions.00078a6134',
          'View in settings'
        )}
      </Button>
      {!canConfigure ? (
        <p className="text-muted-foreground text-xs">
          {translate(
            'auto.components.feature.wall.FeatureWallSetupWorkflowActions.486c2f4d8d',
            'Add a git project first, then configure the setup script for that repository.'
          )}
        </p>
      ) : null}
    </div>
  )
}

export function useSetupTargetWorktree(): Worktree | null {
  const allWorktrees = useAllWorktrees()
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  return (() =>
    allWorktrees.find((worktree) => worktree.id === activeWorktreeId) ?? allWorktrees[0] ?? null)()
}

let pendingSetupGuideTourCancel: (() => void) | null = null
let setupGuideTourRequestSequence = 0

function createSetupGuideTourRequestId(): string {
  setupGuideTourRequestSequence += 1
  return `setup-guide-tour-${setupGuideTourRequestSequence}`
}

export function cancelPendingSetupGuideTourRequest(): void {
  pendingSetupGuideTourCancel?.()
  pendingSetupGuideTourCancel = null
}

export function requestSetupGuideTourWhenReady(args: RequestContextualTourWhenReadyArgs): void {
  cancelPendingSetupGuideTourRequest()
  pendingSetupGuideTourCancel = requestContextualTourWhenReady(args)
}

export function isSetupGuideWorkspaceComposerRequestCurrent(requestId: string): boolean {
  const state = useAppStore.getState()
  const modalData = state.modalData as { setupGuideTourRequestId?: unknown }
  return (
    state.activeModal === 'new-workspace-composer' &&
    modalData.setupGuideTourRequestId === requestId
  )
}
