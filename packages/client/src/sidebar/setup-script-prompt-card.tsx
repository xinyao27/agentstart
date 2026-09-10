import { isGitRepoKind } from '@agentstart/protocol/project/repository'
import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { checkRuntimeHooks, inspectRuntimeSetupScriptImports } from '~renderer/runtime/hooks-client'
import type { SetupScriptImportCandidate } from '~renderer/setup/import-candidate'
import { buildSetupScriptPromptActionTelemetry } from '~renderer/setup/script-telemetry'
import {
  buildImportedHookSettings,
  formatCandidateProvenance,
  formatCandidateSource,
  isSetupScriptPromptDismissed,
  ignoresSharedSetupScripts,
  inspectSetupScriptPromptState,
  type SetupScriptPromptInspection
} from '~renderer/sidebar/setup-script-prompt'
import { useAppStore } from '~renderer/store/state'
import { track } from '~renderer/telemetry/client'

import { openSetupScriptSettings } from './open-setup-script-settings'
import { SetupScriptPromptCardShell } from './setup-script-prompt-card-shell'
import { trackSetupScriptPromptExposure } from './setup-script-prompt-exposure-telemetry'
import {
  getRenderedSetupScriptPromptState,
  useSetupScriptPromptProjectContext
} from './setup-script-prompt-render-state'
import { showSavedInProjectSettingsToast } from './setup-script-prompt-toast'

type PromptState = SetupScriptPromptInspection

function SetupScriptPromptCard(): React.JSX.Element | null {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const { projectHostSetups, repos } = useProjectCatalog()
  const activeRepoId = useAppStore((s) => s.activeRepoId)
  const settings = useAppStore((s) => s.settings)
  const updateRepo = useAppStore((s) => s.updateRepo)
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const setSettingsSearchQuery = useAppStore((s) => s.setSettingsSearchQuery)
  const dismissedRepoIds = useAppStore((s) => s.setupScriptPromptDismissedRepoIds)
  const dismissSetupScriptPrompt = useAppStore((s) => s.dismissSetupScriptPrompt)
  const [promptState, setPromptState] = useState<PromptState | null>(null)
  const [detectedSetupDraft, setDetectedSetupDraft] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [inspectionRetryKey, setInspectionRetryKey] = useState(0)
  const trackedPromptKeysRef = useRef<Set<string>>(new Set())
  const mountedRef = useMountedRef()

  const activeRepo = (() => repos.find((repo) => repo.id === activeRepoId) ?? null)()
  const { activeProjectId } = useSetupScriptPromptProjectContext(
    activeRepo,
    repos,
    projectHostSetups
  )
  const isDismissed = activeRepo
    ? isSetupScriptPromptDismissed(activeRepo.id, dismissedRepoIds)
    : false
  useEffect(() => {
    if (!sidebarOpen || !activeRepo || !isGitRepoKind(activeRepo) || isDismissed) {
      return
    }

    const repo = activeRepo
    let cancelled = false
    async function inspectRepoSetup(): Promise<void> {
      const nextState = await inspectSetupScriptPromptState({
        repo,
        checkHooks: () => checkRuntimeHooks(settings, repo.id),
        inspectImports: () => inspectRuntimeSetupScriptImports(settings, repo.id)
      })
      if (!cancelled) {
        setPromptState(nextState)
        setDetectedSetupDraft(
          nextState.status === 'ok' && nextState.candidate?.provider === 'package-manager'
            ? nextState.candidate.setup
            : ''
        )
      }
    }

    void inspectRepoSetup()

    return () => {
      cancelled = true
    }
  }, [activeRepo, inspectionRetryKey, isDismissed, settings, sidebarOpen])

  const openLocalCommandSettings = (repoId: string) => {
    openSetupScriptSettings({
      repoId,
      setSettingsSearchQuery,
      openSettingsTarget,
      openSettingsPage
    })
  }

  const handleRetryInspection = () => {
    setInspectionRetryKey((value) => value + 1)
  }

  useEffect(() => {
    if (
      !sidebarOpen ||
      !activeRepo ||
      !isGitRepoKind(activeRepo) ||
      isDismissed ||
      promptState?.repoId !== activeRepo.id ||
      promptState.status !== 'ok' ||
      promptState.hasEffectiveSetup
    ) {
      return
    }

    trackSetupScriptPromptExposure({
      repoId: activeRepo.id,
      promptState,
      trackedPromptKeys: trackedPromptKeysRef.current
    })
  }, [activeRepo, isDismissed, promptState, sidebarOpen])

  const handleConfigure = () => {
    if (!activeRepo) {
      return
    }
    if (
      promptState?.repoId === activeRepo.id &&
      promptState.status === 'ok' &&
      !promptState.hasEffectiveSetup
    ) {
      track(
        'setup_script_prompt_action',
        buildSetupScriptPromptActionTelemetry({
          action: 'configure_clicked',
          candidate: promptState.candidate,
          hasSharedHooks: promptState.hasSharedHooks
        })
      )
    }
    openLocalCommandSettings(activeRepo.id)
  }

  const handleDismiss = () => {
    if (activeRepo) {
      if (
        promptState?.repoId === activeRepo.id &&
        promptState.status === 'ok' &&
        !promptState.hasEffectiveSetup
      ) {
        track(
          'setup_script_prompt_action',
          buildSetupScriptPromptActionTelemetry({
            action: 'dismissed',
            candidate: promptState.candidate,
            hasSharedHooks: promptState.hasSharedHooks
          })
        )
      }
      dismissSetupScriptPrompt(activeRepo.id)
    }
  }

  const saveSetupCandidate = async (input: {
    candidate: SetupScriptImportCandidate
    hasSharedHooks: boolean
    actionPrefix: 'save_detected_setup' | 'import'
    editedBeforeSave?: boolean
  }) => {
    const { candidate, hasSharedHooks, actionPrefix, editedBeforeSave } = input
    if (!activeRepo) {
      return
    }
    setIsImporting(true)
    try {
      const importedRepoId = activeRepo.id
      const nextSettings = buildImportedHookSettings(activeRepo, candidate, hasSharedHooks)
      const didUpdate = await updateRepo(activeRepo.id, { hookSettings: nextSettings })
      if (!didUpdate) {
        track(
          'setup_script_prompt_action',
          buildSetupScriptPromptActionTelemetry({
            action:
              actionPrefix === 'save_detected_setup'
                ? 'save_detected_setup_failed'
                : 'import_failed',
            candidate,
            hasSharedHooks,
            editedBeforeSave
          })
        )
        if (mountedRef.current) {
          toast.error(
            translate(
              'auto.components.sidebar.SetupScriptPromptCard.888b83bf78',
              'Failed to save setup script'
            )
          )
        }
        return
      }
      track(
        'setup_script_prompt_action',
        buildSetupScriptPromptActionTelemetry({
          action:
            actionPrefix === 'save_detected_setup'
              ? 'save_detected_setup_completed'
              : 'import_completed',
          candidate,
          hasSharedHooks,
          editedBeforeSave
        })
      )
      if (actionPrefix === 'save_detected_setup') {
        if (mountedRef.current) {
          setPromptState((current) =>
            current?.repoId === activeRepo.id && current.status === 'ok'
              ? { ...current, hasEffectiveSetup: true }
              : current
          )
          showSavedInProjectSettingsToast({
            onOpenSettings: () => openLocalCommandSettings(importedRepoId),
            description: translate(
              'auto.components.sidebar.SetupScriptPromptCard.a49196d538',
              'Runs when AgentStart creates a new worktree.'
            )
          })
        }
        return
      }
      if (mountedRef.current) {
        setPromptState((current) =>
          current?.repoId === activeRepo.id && current.status === 'ok'
            ? { ...current, hasEffectiveSetup: true }
            : current
        )
        const skippedCount = candidate.unsupportedFields?.length ?? 0
        showSavedInProjectSettingsToast({
          onOpenSettings: () => openLocalCommandSettings(importedRepoId),
          description:
            skippedCount > 0
              ? `${skippedCount} unsupported field${skippedCount === 1 ? '' : 's'} skipped. Saved the setup command.`
              : 'Saved the setup command.'
        })
      }
    } catch (error) {
      track(
        'setup_script_prompt_action',
        buildSetupScriptPromptActionTelemetry({
          action:
            actionPrefix === 'save_detected_setup' ? 'save_detected_setup_failed' : 'import_failed',
          candidate,
          hasSharedHooks,
          editedBeforeSave
        })
      )
      console.warn('[setup-script-prompt] Failed to save setup script:', error)
      if (mountedRef.current) {
        toast.error(
          translate(
            'auto.components.sidebar.SetupScriptPromptCard.888b83bf78',
            'Failed to save setup script'
          )
        )
      }
    } finally {
      if (mountedRef.current) {
        setIsImporting(false)
      }
    }
  }

  const handleImport = async () => {
    if (!activeRepo || promptState?.status !== 'ok' || !promptState.candidate) {
      return
    }
    const isPackageManagerCandidate = promptState.candidate.provider === 'package-manager'
    const actionPrefix = isPackageManagerCandidate ? 'save_detected_setup' : 'import'
    const editedBeforeSave =
      isPackageManagerCandidate && detectedSetupDraft.trim() !== promptState.candidate.setup.trim()
    const candidate = isPackageManagerCandidate
      ? {
          ...promptState.candidate,
          setup: detectedSetupDraft.trim()
        }
      : promptState.candidate
    if (!candidate.setup) {
      toast.error(
        translate(
          'auto.components.sidebar.SetupScriptPromptCard.70715947fb',
          'Setup script cannot be empty'
        )
      )
      return
    }
    if (actionPrefix === 'save_detected_setup') {
      track(
        'setup_script_prompt_action',
        buildSetupScriptPromptActionTelemetry({
          action: 'save_detected_setup_clicked',
          candidate,
          hasSharedHooks: promptState.hasSharedHooks,
          editedBeforeSave
        })
      )
    }
    await saveSetupCandidate({
      candidate,
      hasSharedHooks: promptState.hasSharedHooks,
      actionPrefix,
      editedBeforeSave: isPackageManagerCandidate ? editedBeforeSave : undefined
    })
  }

  if (!sidebarOpen || !activeRepo || !isGitRepoKind(activeRepo) || isDismissed) {
    return null
  }

  const renderedPromptState =
    activeRepo &&
    getRenderedSetupScriptPromptState({
      promptState,
      activeRepoId: activeRepo.id,
      activeProjectId,
      lastVisiblePrompt: null
    })

  if (
    !renderedPromptState ||
    (renderedPromptState.status === 'ok' && renderedPromptState.hasEffectiveSetup)
  ) {
    return null
  }

  // Why: a forbidden (mobile-scope) inspection is permanent, so suppress the
  // retry-able card entirely — the global scope-mismatch banner explains it and
  // a retry would just re-fire repo.hooksCheck on every repo focus.
  if (renderedPromptState.status === 'forbidden') {
    return null
  }

  const isInspectionError = renderedPromptState.status === 'error'
  const candidate = renderedPromptState.status === 'ok' ? renderedPromptState.candidate : null
  const isPackageManagerSuggestion = candidate?.provider === 'package-manager'
  const sharedSetupIgnored =
    renderedPromptState.status === 'ok' &&
    candidate === null &&
    ignoresSharedSetupScripts(activeRepo)
  const candidateSource = candidate ? formatCandidateSource(candidate) : null
  const candidateProvenance = candidate ? formatCandidateProvenance(candidate) : null

  return (
    <SetupScriptPromptCardShell
      repoBadgeColor={activeRepo.badgeColor}
      repoDisplayName={activeRepo.displayName}
      isInspectionError={isInspectionError}
      sharedSetupIgnored={sharedSetupIgnored}
      isPackageManagerSuggestion={Boolean(isPackageManagerSuggestion && candidate)}
      hasCandidate={Boolean(candidate)}
      candidateSource={candidateSource}
      candidateProvenance={candidateProvenance}
      detectedSetupDraft={detectedSetupDraft}
      isImporting={isImporting}
      renderedStateOk={renderedPromptState.status === 'ok'}
      onDismiss={handleDismiss}
      onRetryInspection={handleRetryInspection}
      onConfigure={handleConfigure}
      onImport={() => void handleImport()}
      onSetupDraftChange={setDetectedSetupDraft}
    />
  )
}

export default SetupScriptPromptCard
