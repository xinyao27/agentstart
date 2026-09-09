import type { TuiAgent } from '@yiru/protocol/agent/types'
import type { ExecutionHostId } from '@yiru/protocol/host/identity'
import type { ProjectSourceContext } from '@yiru/protocol/project/source-context'
import type { ContextualTourId } from '@yiru/protocol/settings/contextual-tours'
import type { FeatureTipId } from '@yiru/protocol/settings/feature-tips'
import type { TopLevelView } from '@yiru/protocol/settings/ui-state'
import type { FeatureInteractionId } from '@yiru/protocol/telemetry/interactions/catalog'
import type { FeatureInteractionState } from '@yiru/protocol/telemetry/interactions/state'
import type { SettingsNavTarget } from '~renderer/settings/navigation-types'

import type { AgentSendPopoverTargetMode, OpenAgentSendPopoverTargetModeArgs } from './slice'

export type UIShellState = {
  sidebarOpen: boolean
  sidebarWidth: number
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setSidebarWidth: (width: number) => void
  agentSendPopoverTargetMode: AgentSendPopoverTargetMode | null
  openAgentSendPopoverTargetMode: (args: OpenAgentSendPopoverTargetModeArgs) => void
  closeAgentSendPopoverTargetMode: (id?: string, instanceId?: string) => void
  sendPromptToSidebarAgentTarget: (paneKey: string) => Promise<boolean>
  diffNotesSendMenuOpenRequest: { worktreeId: string; nonce: number; issuedAt: number } | null
  /** Requests the active workspace's notes menu; false means there is nothing to send. */
  openDiffNotesSendMenuForActiveWorktree: () => boolean
  consumeDiffNotesSendMenuOpenRequest: (worktreeId: string) => void
  /** Per-agent "I've looked at this" timestamps, keyed by paneKey. Set when
   *  the user clicks an agent row or its parent workspace card from the
   *  dashboard. A row is considered unvisited when no ack exists OR the
   *  agent's current stateStartedAt is newer than the last ack (i.e. the
   *  agent has transitioned state since the user last saw it). Persisted
   *  via PersistedUIState because agent rows themselves now survive restart —
   *  without this, rows you'd already visited come back bold on relaunch. */
  acknowledgedAgentsByPaneKey: Record<string, number>
  acknowledgeAgents: (paneKeys: string[]) => void
  unacknowledgeAgents: (paneKeys: string[]) => void
  activeView: TopLevelView
  previousViewBeforeSettings: Exclude<TopLevelView, 'settings'>
  previousViewBeforeSpace: Exclude<TopLevelView, 'space'>
  previousViewBeforeSkills: Exclude<TopLevelView, 'skills'>
  previousViewBeforeMobile: Exclude<TopLevelView, 'mobile'>
  setActiveView: (view: UIShellState['activeView']) => void
  openHomePage: () => void
  newWorkspaceDraft: {
    repoId: string | null
    // Why: project-first workspace creation resolves through these when present,
    // while old drafts can keep using only repoId during the additive migration.
    projectId?: string | null
    projectGroupId?: string | null
    hostId?: ExecutionHostId | null
    projectHostSetupId?: string | null
    name: string
    prompt: string
    note: string
    attachments: string[]
    linkedWorkItem: {
      type: 'pr'
      number: number
      title: string
      url: string
    } | null
    /** Review context stays separate from the host selected to run the workspace. */
    projectSourceContext?: ProjectSourceContext | null
    agent: TuiAgent
    linkedPR: number | null
    // Why: repo-scoped start ref selected via the "Start from" picker.
    // Absent means "use the repo's effective base ref".
    baseBranch?: string
    // Why: review-created worktrees can start from a head ref/SHA while Source
    // Control must compare against the provider target branch.
    compareBaseRef?: string
  } | null
  openSpacePage: () => void
  closeSpacePage: () => void
  openSkillsPage: () => void
  closeSkillsPage: () => void
  openMobilePage: () => void
  closeMobilePage: () => void
  setNewWorkspaceDraft: (draft: NonNullable<UIShellState['newWorkspaceDraft']>) => void
  clearNewWorkspaceDraft: () => void
  openSettingsPage: () => void
  closeSettingsPage: () => void
  settingsNavigationTarget: {
    pane: SettingsNavTarget
    repoId: string | null
    sectionId?: string
    intent?: 'add-quick-command'
  } | null
  openSettingsTarget: (target: NonNullable<UIShellState['settingsNavigationTarget']>) => void
  clearSettingsTarget: () => void
  /**
   * Which host the Projects Settings pane shows for each project, keyed by
   * projectId. Set by the pane's "Available Hosts" switcher. Ephemeral on
   * purpose — never persisted, so a reload reopens on the project's effective
   * host rather than a possibly-dangling selection.
   */
  settingsProjectHostSelection: Record<string, ExecutionHostId>
  setSettingsProjectHostSelection: (projectId: string, hostId: ExecutionHostId) => void
  /**
   * One-shot Appearance accordion to expand for nested Settings deep links
   * (e.g. Usage percentages lives under Window & Sidebar). Cleared when
   * Appearance consumes it.
   */
  appearanceAccordionDeepLink: 'interface' | 'terminal' | 'window' | null
  setAppearanceAccordionDeepLink: (
    section: NonNullable<UIShellState['appearanceAccordionDeepLink']>
  ) => void
  clearAppearanceAccordionDeepLink: () => void
  activeModal:
    | 'none'
    | 'create-worktree'
    | 'edit-meta'
    | 'delete-worktree'
    | 'confirm-add-project-from-folder'
    | 'confirm-non-git-folder'
    | 'confirm-remove-folder'
    | 'add-repo'
    | 'worktree-visibility'
    | 'workspace-cleanup'
    | 'project-added'
    | 'setup-guide'
    | 'feature-wall'
    | 'feature-tips'
    | 'new-workspace-composer'
    | 'confirm-yiru-yaml-hooks'
  modalData: Record<string, unknown>
  openModal: (modal: UIShellState['activeModal'], data?: Record<string, unknown>) => void
  closeModal: () => void
  featureTipsSeenIds: FeatureTipId[]
  markFeatureTipsSeen: (ids: FeatureTipId[]) => void
  featureInteractions: FeatureInteractionState
  recordFeatureInteraction: (id: FeatureInteractionId) => Promise<void>
  contextualToursSeenIds: ContextualTourId[]
  contextualToursAutoEligible: boolean | null
  activeContextualTourId: ContextualTourId | null
  activeContextualTourStepIndex: number
  activeContextualTourSource: string | null
  activeContextualTourSourceDetached: boolean
  activeContextualTourWasFeaturePreviouslyInteracted: boolean
  contextualTourNavigationInteractionSnapshot: Partial<Record<ContextualTourId, boolean>>
  activeContextualTourSuppressed: boolean
  contextualTourShownThisSession: boolean
  contextualToursOnboardingVisible: boolean
  contextualToursBlockingSurfaceVisible: boolean
  lastCompletedContextualTourId: ContextualTourId | null
  setContextualToursAutoEligible: (eligible: boolean) => void
  setContextualToursOnboardingVisible: (visible: boolean) => void
  setContextualToursBlockingSurfaceVisible: (visible: boolean) => void
  requestContextualTour: (
    id: ContextualTourId,
    source: string,
    wasFeaturePreviouslyInteracted?: boolean,
    options?: { force?: boolean }
  ) => void
  suppressContextualTour: (id: ContextualTourId, source: string) => void
  detachContextualTourSource: (id: ContextualTourId, source: string) => void
  advanceContextualTour: () => void
  regressContextualTour: () => void
  dismissContextualTour: (id?: ContextualTourId) => void
  completeContextualTour: (id?: ContextualTourId) => void
  cancelContextualTour: (id?: ContextualTourId) => void
  markContextualToursSeen: (ids: ContextualTourId[]) => void
}
