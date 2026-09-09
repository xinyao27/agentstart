import type { TuiAgent } from '@yiru/protocol/agent/types'
import type { ProjectSourceContext } from '@yiru/protocol/project/source-context'
import type { WorkspaceSource as WorkspaceCreateTelemetrySource } from '@yiru/protocol/workspace/source'
import type { WorkspaceStatus } from '@yiru/protocol/workspace/status/model'
import React, { useEffect, useState } from 'react'
import AgentSettingsDialog from '~renderer/agent/settings-dialog'
import { translate } from '~renderer/i18n/i18n'
import { isScreenSubmitShortcut } from '~renderer/keyboard-input/screen-submit-shortcut'
import { NewWorkspaceComposerCard } from '~renderer/new-workspace-composer-card/card'
import { useComposerState } from '~renderer/new-workspace/use-composer-state'
import type { LinkedWorkItemSummary } from '~renderer/new-workspace/workspace-creation'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { getFolderWorkspacePrimaryActionLabel } from '~renderer/sidebar/folder-workspace-composer-model'
import { useAppStore } from '~renderer/store/state'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'

import { shouldAllowComposerEnterSubmitTarget } from './new-workspace-enter-guard'
import {
  pickQuickWorkspaceAgent,
  resolveQuickWorkspaceAgentSelection
} from './quick-workspace-agent-selection'
import { getWorkspaceComposerInitialFocusTarget } from './workspace-composer-initial-focus'

type ComposerModalData = {
  prefilledName?: string
  initialRepoId?: string
  initialProjectGroupId?: string
  linkedWorkItem?: LinkedWorkItemSummary | null
  projectSourceContext?: ProjectSourceContext | null
  initialBaseBranch?: string
  initialWorkspaceStatus?: WorkspaceStatus
  /** Telemetry surface that opened the composer. Set by each
   *  `openModal('new-workspace-composer', ...)` site so
   *  `workspace_created.source` carries the right value. Falls back to
   *  `unknown` when omitted. */
  telemetrySource?: WorkspaceCreateTelemetrySource
  contextualTourSource?: string
  setupGuideTourRequestId?: string
}

export default function NewWorkspaceComposerModal(): React.JSX.Element | null {
  const visible = useAppStore((s) => s.activeModal === 'new-workspace-composer')
  const modalData = useAppStore((s) => s.modalData as ComposerModalData | undefined)
  const closeModal = useAppStore((s) => s.closeModal)

  // Why: Dialog open-state transitions must be driven by the store, not a
  // mirror useState, so palette/open-modal calls feel instantaneous and the
  // modal doesn't linger with stale data after close.
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeModal()
    }
  }

  if (!visible) {
    return null
  }

  return (
    <ComposerModalBody
      modalData={modalData ?? {}}
      onClose={closeModal}
      onOpenChange={handleOpenChange}
    />
  )
}

function ComposerModalBody({
  modalData,
  onClose,
  onOpenChange
}: {
  modalData: ComposerModalData
  onClose: () => void
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const contentRef = React.useRef<HTMLDivElement | null>(null)
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden sm:max-w-lg"
        initialFocus={() => {
          // Why: skip Base UI's default auto-focus (the close button) and focus
          // the name/source field instead so users can start typing immediately.
          const content = contentRef.current
          if (content) {
            getWorkspaceComposerInitialFocusTarget(content)?.focus({ preventScroll: true })
          }
          return false
        }}
      >
        <QuickTabBody modalData={modalData} onClose={onClose} active />
      </DialogContent>
    </Dialog>
  )
}

function QuickTabBody({
  modalData,
  onClose,
  active
}: {
  modalData: ComposerModalData
  onClose: () => void
  active: boolean
}): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const {
    cardProps,
    composerRef,
    onComposerNodeChange,
    nameInputRef,
    submitQuick,
    createDisabled
  } = useComposerState({
    initialName: modalData.prefilledName ?? '',
    // Why: the modal is quick-create only now, so prompt-prefill state is
    // intentionally ignored even if older callers still send it.
    initialPrompt: '',
    initialLinkedWorkItem: modalData.linkedWorkItem ?? null,
    initialProjectSourceContext: modalData.projectSourceContext ?? null,
    initialRepoId: modalData.initialRepoId,
    initialProjectGroupId: modalData.initialProjectGroupId,
    initialWorkspaceStatus: modalData.initialWorkspaceStatus,
    ...(modalData.initialBaseBranch ? { initialBaseBranch: modalData.initialBaseBranch } : {}),
    persistDraft: false,
    onCreated: onClose,
    ...(modalData.telemetrySource ? { telemetrySource: modalData.telemetrySource } : {}),
    createGateMode: 'quick'
  })
  // Why: the composer's built-in `onOpenAgentSettings` handler navigates to
  // the settings page and closes the modal. For the quick-create flow we want
  // a less disruptive affordance — a nested dialog layered over the composer
  // so the user can tweak agents without losing their in-progress workspace
  // name/repo selection.
  const [agentSettingsOpen, setAgentSettingsOpen] = useState(false)
  // Why: once the user picks an agent, their choice wins and must not be
  // overwritten when the derived "preferred" value changes (e.g. detection
  // finishes and adds more installed agents to the set). Track that with an
  // override rather than an effect that mirrors a prop into state — deriving
  // during render keeps the selection in sync with the detected set without
  // triggering an extra commit.
  const [quickAgentOverride, setQuickAgentOverride] = useState<TuiAgent | null | undefined>(
    undefined
  )
  const preferredQuickAgent = (() => {
    const pref = settings?.defaultTuiAgent
    // Why: detection can still be pending when quick-create submits; keep the
    // prior catalog fallback while filtering disabled agents out of that choice.
    return pickQuickWorkspaceAgent(pref, cardProps.detectedAgentIds, settings?.disabledTuiAgents)
  })()
  const resolvedQuickAgentSelection = resolveQuickWorkspaceAgentSelection({
    quickAgentOverride,
    preferredQuickAgent,
    detectedAgentIds: cardProps.detectedAgentIds,
    disabledTuiAgents: settings?.disabledTuiAgents
  })
  if (resolvedQuickAgentSelection.quickAgentOverride !== quickAgentOverride) {
    // Why: detection/settings changes can invalidate a user-picked agent; repair
    // before the child selector renders an unavailable option for one commit.
    setQuickAgentOverride(resolvedQuickAgentSelection.quickAgentOverride)
  }
  const quickAgent = resolvedQuickAgentSelection.quickAgent

  const handleQuickAgentChange = (agent: TuiAgent | null) => {
    setQuickAgentOverride(agent)
  }

  const handleCreate = useEventCallback(async (): Promise<void> => {
    await submitQuick(quickAgent)
  })
  const selectedProjectOption = cardProps.projectOptions.find(
    (option) => option.id === cardProps.selectedProjectId
  )
  const isFolderWorkspaceTarget = selectedProjectOption?.kind === 'project-group'
  const primaryActionLabel = isFolderWorkspaceTarget
    ? getFolderWorkspacePrimaryActionLabel()
    : cardProps.selectedRepoIsGit
      ? translate('auto.components.NewWorkspaceComposerModal.createWorktree', 'Create worktree')
      : translate('auto.components.NewWorkspaceComposerModal.createWorkspace', 'Create workspace')

  // Cmd/Ctrl+Enter submits, Esc first blurs the focused input (like the full page).
  useEffect(() => {
    if (!active) {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' && event.key !== 'Escape') {
        return
      }
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }

      if (event.key === 'Escape') {
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          target.isContentEditable
        ) {
          event.preventDefault()
          target.blur()
          return
        }
        event.preventDefault()
        onClose()
        return
      }

      // Why: workspace creation is screen-local submit behavior, not a
      // user-configurable app command.
      if (!isScreenSubmitShortcut(event)) {
        return
      }
      if (!shouldAllowComposerEnterSubmitTarget(target, composerRef.current)) {
        return
      }
      if (createDisabled) {
        return
      }
      event.preventDefault()
      void handleCreate()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [active, composerRef, createDisabled, handleCreate, onClose])

  return (
    <>
      <DialogHeader className="gap-1">
        <DialogTitle className="text-base font-semibold">
          {isFolderWorkspaceTarget
            ? translate(
                'auto.components.sidebar.FolderWorkspaceComposerDialog.title',
                'Create Folder Workspace'
              )
            : primaryActionLabel}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {translate(
            'auto.components.NewWorkspaceComposerModal.fa90f739a5',
            'Choose the project, workspace name, and agent before creating the workspace.'
          )}
        </DialogDescription>
      </DialogHeader>
      <NewWorkspaceComposerCard
        contextualTourSource={modalData.contextualTourSource}
        containerClassName="min-h-0 flex-1 overflow-y-auto scrollbar-sleek"
        composerRef={composerRef}
        onComposerNodeChange={onComposerNodeChange}
        nameInputRef={nameInputRef}
        quickAgent={quickAgent}
        onQuickAgentChange={handleQuickAgentChange}
        {...cardProps}
        primaryActionLabel={primaryActionLabel}
        onOpenAgentSettings={() => setAgentSettingsOpen(true)}
        onCreate={() => void handleCreate()}
      />
      <AgentSettingsDialog open={agentSettingsOpen} onOpenChange={setAgentSettingsOpen} />
    </>
  )
}
