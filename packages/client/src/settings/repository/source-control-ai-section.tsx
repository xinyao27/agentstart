import type { TuiAgent } from '@yiru/protocol/agent/types'
import type { Repo } from '@yiru/protocol/project/repository'
import {
  SOURCE_CONTROL_ACTION_IDS,
  type SourceControlActionId
} from '@yiru/protocol/source-control/ai-actions'
import type { RepoSourceControlAiOverrides } from '@yiru/protocol/source-control/ai-types'
import { CUSTOM_AGENT_ID } from '@yiru/protocol/source-control/custom-agent'
import { normalizeRepoSourceControlAiOverrides } from '@yiru/protocol/source-control/repo-overrides'
import { normalizeSourceControlAiSettings } from '@yiru/protocol/source-control/settings'
import { useState } from 'react'
import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { toSourceControlAiRepoUpdate } from '~renderer/source-control/ai-recipe-save'
import type { SourceControlAiRepoUpdate } from '~renderer/source-control/ai-recipe-save'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'

import { getSettingOwnershipSummary } from '../setting-ownership'
import { getRepositorySourceControlAiSectionId } from './settings-targets'
import { RepositorySourceControlAiActionRows } from './source-control-ai-action-rows'
import { RepositorySourceControlAiCustomCommand } from './source-control-ai-custom-command'
import {
  buildActionScopedRepoAiSave,
  createRepoAiDraftState,
  dropRepoLegacyInstructionForAction,
  hasOwnActionOverride,
  normalizeRepoAiDraft,
  readCompleteRecipeForDraft,
  resolveRepoAiDraftState,
  serializeActionOverride,
  serializeRepoAiDraft,
  setActionOverride,
  type RepoAiDraftState
} from './source-control-ai-draft'
import { RepositorySourceControlAiEnablement } from './source-control-ai-enablement'
import { RepositorySourceControlAiHostedReviewDefaults } from './source-control-ai-hosted-review-defaults'
import {
  ACTION_MODE_INHERIT,
  DEFAULT_AGENT_VALUE,
  readInheritedCommandTemplate
} from './source-control-ai-labels'

export {
  createRepoAiDraftState,
  dropRepoLegacyInstructionForAction,
  resolveRepoAiDraftState
} from './source-control-ai-draft'

type RepositorySourceControlAiSectionProps = {
  repo: Repo
  updateRepo: (repoId: string, updates: SourceControlAiRepoUpdate) => void | Promise<boolean>
}

type HostedReviewDefaultKey = keyof NonNullable<RepoSourceControlAiOverrides['prCreationDefaults']>

export function RepositorySourceControlAiSection({
  repo,
  updateRepo
}: RepositorySourceControlAiSectionProps): React.JSX.Element {
  const mountedRef = useMountedRef()
  const settings = useAppStore((state) => state.settings)
  const ownership = getSettingOwnershipSummary('repositorySourceControlAi')
  const source = normalizeSourceControlAiSettings(
    settings?.sourceControlAi,
    settings?.commitMessageAi
  )
  const persistedRepoAi = (() => normalizeRepoAiDraft(repo.sourceControlAi))()
  const persistedSerialized = (() => serializeRepoAiDraft(persistedRepoAi))()
  // Why: repo.sourceControlAi is saved as one nested value; a local draft keeps
  // textarea keystrokes and sibling controls from racing over IPC/RPC.
  const [draftState, setDraftState] = useState<RepoAiDraftState>(() =>
    createRepoAiDraftState(repo.id, persistedRepoAi)
  )
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const resolvedDraftState = resolveRepoAiDraftState(
    draftState,
    repo.id,
    persistedRepoAi,
    persistedSerialized
  )
  if (resolvedDraftState !== draftState) {
    // Why: repo settings may be refreshed externally; clean drafts should
    // follow that source before paint, while dirty edits stay in place.
    setDraftState(resolvedDraftState)
    if (saveError !== null) {
      setSaveError(null)
    }
  }

  const repoAi = resolvedDraftState.value
  const draftSerialized = (() => serializeRepoAiDraft(repoAi))()
  const isDirty =
    resolvedDraftState.repoId !== repo.id || draftSerialized !== resolvedDraftState.baseSerialized
  const actionDirtyById = (() =>
    Object.fromEntries(
      SOURCE_CONTROL_ACTION_IDS.map((actionId) => [
        actionId,
        serializeActionOverride(repoAi, actionId) !==
          serializeActionOverride(persistedRepoAi, actionId)
      ])
    ) as Record<SourceControlActionId, boolean>)()

  const updateDraftRepoAi = (
    update: (current: RepoSourceControlAiOverrides) => RepoSourceControlAiOverrides
  ): void => {
    setDraftState((current) => {
      const resolved = resolveRepoAiDraftState(
        current,
        repo.id,
        persistedRepoAi,
        persistedSerialized
      )
      return {
        ...resolved,
        value: normalizeRepoAiDraft(update(resolved.value))
      }
    })
    setSaveError(null)
  }

  const saveDraft = async (): Promise<void> => {
    if (!isDirty || isSaving) {
      return
    }
    const next = normalizeRepoAiDraft(resolvedDraftState.value)
    const nextSerialized = serializeRepoAiDraft(next)
    const repoUpdate = toSourceControlAiRepoUpdate(next)
    setIsSaving(true)
    setSaveError(null)
    try {
      const result = await updateRepo(repo.id, repoUpdate)
      if (!mountedRef.current) {
        return
      }
      if (result === false) {
        setSaveError('Failed to save Source Control AI settings.')
        return
      }
      const savedValue =
        repoUpdate.sourceControlAi === null
          ? {}
          : (normalizeRepoSourceControlAiOverrides(repoUpdate.sourceControlAi) ?? {})
      setDraftState((current) => {
        if (current.repoId !== repo.id) {
          return current
        }
        const currentSerialized = serializeRepoAiDraft(current.value)
        return {
          repoId: repo.id,
          value: currentSerialized === nextSerialized ? savedValue : current.value,
          baseSerialized: serializeRepoAiDraft(savedValue)
        }
      })
    } catch {
      if (mountedRef.current) {
        setSaveError('Failed to save Source Control AI settings.')
      }
    } finally {
      if (mountedRef.current) {
        setIsSaving(false)
      }
    }
  }

  const discardDraft = (): void => {
    setDraftState(createRepoAiDraftState(repo.id, persistedRepoAi))
    setSaveError(null)
  }

  const discardActionDraft = (actionId: SourceControlActionId): void => {
    updateDraftRepoAi((current) => {
      const nextActionOverrides = { ...current.actionOverrides }
      if (hasOwnActionOverride(persistedRepoAi.actionOverrides, actionId)) {
        nextActionOverrides[actionId] = persistedRepoAi.actionOverrides?.[actionId]
      } else {
        delete nextActionOverrides[actionId]
      }
      return dropRepoLegacyInstructionForAction(
        { ...current, actionOverrides: nextActionOverrides },
        actionId
      )
    })
  }

  const saveActionDraft = async (actionId: SourceControlActionId): Promise<void> => {
    if (isSaving || !actionDirtyById[actionId]) {
      return
    }
    // Why: a per-action Save persists only that action's override (its Discard is
    // action-scoped, so its Save must be too) — never other rows' pending edits.
    const next = buildActionScopedRepoAiSave(persistedRepoAi, repoAi, actionId)
    const repoUpdate = toSourceControlAiRepoUpdate(next)
    setIsSaving(true)
    setSaveError(null)
    try {
      const result = await updateRepo(repo.id, repoUpdate)
      if (!mountedRef.current) {
        return
      }
      if (result === false) {
        setSaveError('Failed to save Source Control AI settings.')
      }
    } catch {
      if (mountedRef.current) {
        setSaveError('Failed to save Source Control AI settings.')
      }
    } finally {
      if (mountedRef.current) {
        setIsSaving(false)
      }
    }
  }

  const updateEnablement = (value: boolean | undefined): void => {
    updateDraftRepoAi((current) => ({ ...current, enabled: value }))
  }

  const updateCustomCommand = (value: string | undefined): void => {
    updateDraftRepoAi((current) => ({ ...current, customAgentCommand: value }))
  }

  const updateActionMode = (actionId: SourceControlActionId, mode: string): void => {
    updateDraftRepoAi((current) => {
      const nextActionOverrides = { ...current.actionOverrides }
      if (mode === ACTION_MODE_INHERIT) {
        delete nextActionOverrides[actionId]
        return dropRepoLegacyInstructionForAction(
          { ...current, actionOverrides: nextActionOverrides },
          actionId
        )
      }
      if (!hasOwnActionOverride(nextActionOverrides, actionId)) {
        nextActionOverrides[actionId] = readCompleteRecipeForDraft(current, settings, actionId)
      }
      return dropRepoLegacyInstructionForAction(
        { ...current, actionOverrides: nextActionOverrides },
        actionId
      )
    })
  }

  const updateActionAgent = (actionId: SourceControlActionId, value: string): void => {
    updateDraftRepoAi((current) => {
      const currentRecipe =
        current.actionOverrides?.[actionId] ??
        readCompleteRecipeForDraft(current, settings, actionId)
      const nextRecipe = {
        ...currentRecipe,
        agentId:
          value === DEFAULT_AGENT_VALUE
            ? null
            : value === CUSTOM_AGENT_ID
              ? CUSTOM_AGENT_ID
              : (value as TuiAgent)
      }
      return setActionOverride(current, actionId, nextRecipe)
    })
  }

  const updateActionTemplate = (actionId: SourceControlActionId, value: string): void => {
    updateDraftRepoAi((current) => {
      const currentRecipe =
        current.actionOverrides?.[actionId] ??
        readCompleteRecipeForDraft(current, settings, actionId)
      return setActionOverride(current, actionId, {
        ...currentRecipe,
        commandInputTemplate: value
      })
    })
  }

  const updateActionAgentArgs = (actionId: SourceControlActionId, value: string): void => {
    updateDraftRepoAi((current) => {
      const currentRecipe =
        current.actionOverrides?.[actionId] ??
        readCompleteRecipeForDraft(current, settings, actionId)
      return setActionOverride(current, actionId, {
        ...currentRecipe,
        agentArgs: value
      })
    })
  }

  const appendVariable = (actionId: SourceControlActionId, variable: string): void => {
    const override = repoAi.actionOverrides?.[actionId]
    const currentTemplate =
      typeof override?.commandInputTemplate === 'string'
        ? override.commandInputTemplate
        : readInheritedCommandTemplate(source, actionId)
    const separator = currentTemplate.endsWith('\n') || currentTemplate.length === 0 ? '' : ' '
    updateActionTemplate(actionId, `${currentTemplate}${separator}{${variable}}`)
  }

  const updateHostedReviewDefault = (key: HostedReviewDefaultKey, value: string): void => {
    updateDraftRepoAi((current) => {
      const nextDefaults = { ...current.prCreationDefaults }
      if (value === 'inherit') {
        delete nextDefaults[key]
      } else {
        nextDefaults[key] = value === 'on'
      }
      return { ...current, prCreationDefaults: nextDefaults }
    })
  }

  return (
    <section
      id={getRepositorySourceControlAiSectionId(repo.id)}
      data-settings-section={getRepositorySourceControlAiSectionId(repo.id)}
      className="space-y-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold">
            {translate(
              'auto.components.settings.RepositorySourceControlAiSection.71b003b62b',
              'Source Control AI'
            )}
          </h3>
          <p className="text-muted-foreground text-xs">{ownership.description}</p>
          {saveError ? <p className="text-destructive text-xs">{saveError}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <span className="text-muted-foreground text-[11px]">
            {isDirty
              ? translate(
                  'auto.components.settings.RepositorySourceControlAiSection.e57dde9d93',
                  'Unsaved changes'
                )
              : translate(
                  'auto.components.settings.RepositorySourceControlAiSection.ccb07dd027',
                  'Saved'
                )}
          </span>
          {isDirty ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={discardDraft}
              disabled={isSaving}
            >
              {translate(
                'auto.components.settings.RepositorySourceControlAiSection.67b3ff5467',
                'Discard'
              )}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="xs"
            onClick={() => void saveDraft()}
            disabled={!isDirty || isSaving}
          >
            {isSaving
              ? translate(
                  'auto.components.settings.RepositorySourceControlAiSection.57e6e9d4b1',
                  'Saving...'
                )
              : translate(
                  'auto.components.settings.RepositorySourceControlAiSection.152268c295',
                  'Save'
                )}
          </Button>
        </div>
      </div>

      <RepositorySourceControlAiEnablement
        value={repoAi.enabled}
        source={source}
        onChange={updateEnablement}
      />
      <RepositorySourceControlAiCustomCommand
        value={repoAi.customAgentCommand}
        source={source}
        onChange={updateCustomCommand}
      />
      <RepositorySourceControlAiActionRows
        repoId={repo.id}
        repoAi={repoAi}
        source={source}
        defaultTuiAgent={settings?.defaultTuiAgent}
        isSaving={isSaving}
        actionDirtyById={actionDirtyById}
        onActionModeChange={updateActionMode}
        onActionAgentChange={updateActionAgent}
        onActionTemplateChange={updateActionTemplate}
        onActionAgentArgsChange={updateActionAgentArgs}
        onAppendVariable={appendVariable}
        onActionDiscard={discardActionDraft}
        onActionSave={(actionId) => void saveActionDraft(actionId)}
      />
      <RepositorySourceControlAiHostedReviewDefaults
        value={repoAi.prCreationDefaults}
        source={source}
        onChange={updateHostedReviewDefault}
      />
    </section>
  )
}
