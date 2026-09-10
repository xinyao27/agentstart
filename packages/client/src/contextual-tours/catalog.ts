import type { ContextualTourId } from '@agentstart/protocol/settings/contextual-tours'
import type { FeatureInteractionId } from '@agentstart/protocol/telemetry/interactions/catalog'
import { translate } from '~renderer/i18n/i18n'
import { createLocalizedCatalog } from '~renderer/i18n/localized-catalog'

export type ContextualTourStepControl = {
  kind: 'auto-rename-branch-from-work'
}

type ContextualTourStepActionKind =
  | 'next'
  | 'complete'
  | 'split-terminal-pane'
  | 'create-worktree'
  | 'show-worktrees'
  | 'open-getting-started'

export type ContextualTourStepAction = {
  kind: ContextualTourStepActionKind
  label: string
}

export type ContextualTourStepPlacement = 'top' | 'right' | 'bottom' | 'left'

export type ContextualTourStep = {
  title: string
  body: string
  targetSelector: string
  requiredForStart?: boolean
  fallbackCopy?: string
  preferredPlacement?: ContextualTourStepPlacement
  targetPulse?: boolean
  hidePrimaryAction?: boolean
  control?: ContextualTourStepControl
  primaryAction?: ContextualTourStepAction
  secondaryAction?: ContextualTourStepAction
  advanceOnFeatureInteraction?: FeatureInteractionId
}

export type ContextualTour = {
  id: ContextualTourId
  allowedActiveModals?: readonly string[]
  steps: readonly ContextualTourStep[]
}

const getContextualTours = createLocalizedCatalog((): readonly ContextualTour[] => [
  {
    id: 'workspace-agent-sessions',
    steps: [
      {
        title: translate('contextual-tours.0ec1d9bac9', 'Split a terminal pane'),
        body: translate(
          'contextual-tours.875e49569a',
          'Open a second terminal pane with {terminal.splitRight}, or right-click the pane for split options.'
        ),
        targetSelector:
          '[data-contextual-tour-target="terminal-pane-split-target"], [data-contextual-tour-target="workspace-agent-terminal-tip"]',
        requiredForStart: true,
        preferredPlacement: 'bottom',
        primaryAction: {
          kind: 'split-terminal-pane',
          label: translate('contextual-tours.205dfe6b66', 'Split terminal')
        },
        advanceOnFeatureInteraction: 'terminal-pane-split'
      },
      {
        title: translate('contextual-tours.aa239e1761', 'Start another task in parallel'),
        body: translate(
          'contextual-tours.2955ac8398',
          'Each worktree gets its own branch, so parallel work stays separate.'
        ),
        targetSelector: '[data-contextual-tour-target="workspace-create-control"]',
        preferredPlacement: 'right',
        targetPulse: true,
        hidePrimaryAction: true
      }
    ]
  },
  {
    id: 'browser',
    steps: [
      {
        title: translate('contextual-tours.4a9db31908', 'Grab page context for agents'),
        body: translate(
          'contextual-tours.f54a59e067',
          "Use the grab tool to copy a page element's context for agents."
        ),
        targetSelector: '[data-contextual-tour-target="browser-grab-control"]',
        requiredForStart: true,
        preferredPlacement: 'bottom'
      },
      {
        title: translate('contextual-tours.26ef6cb9e3', 'Mark design feedback in place'),
        body: translate(
          'contextual-tours.8485743c15',
          'Annotate elements and send those notes to an agent.'
        ),
        targetSelector: '[data-contextual-tour-target="browser-annotation-control"]',
        preferredPlacement: 'bottom'
      },
      {
        title: translate('contextual-tours.ab573bd0e9', 'Stay logged in'),
        body: translate(
          'contextual-tours.cc98d6cf9e',
          'Bring your existing logins into AgentStart to stay signed in immediately.'
        ),
        // Prefer the always-visible Import button; fall back to the overflow-menu
        // item only once the user has dismissed the import hint.
        targetSelector:
          '[data-contextual-tour-target="browser-import-hint"], [data-contextual-tour-target="browser-import-cookies-control"]',
        // Sit below the Import button with the arrow pointing up at it.
        preferredPlacement: 'bottom'
      }
    ]
  },
  {
    id: 'workspace-creation',
    allowedActiveModals: ['new-workspace-composer'],
    steps: [
      {
        title: translate('contextual-tours.eca71e5d1a', 'Pick a project'),
        body: translate(
          'contextual-tours.d322379476',
          'AgentStart isolates each task in its own worktree, branched off your base.'
        ),
        targetSelector: '[data-contextual-tour-target="workspace-creation-project"]',
        requiredForStart: true
      },
      {
        title: translate('contextual-tours.c016688c4f', 'Name it, or start from existing work'),
        body: translate(
          'contextual-tours.7b83a21ec3',
          'Start from a linked pull request for a short PR name. Or leave it blank to auto-name it from your first agent message.'
        ),
        targetSelector: '[data-contextual-tour-target="workspace-creation-name"]',
        control: { kind: 'auto-rename-branch-from-work' }
      },
      {
        title: translate('contextual-tours.0e5e66b764', 'Choose what agent starts the work'),
        body: translate(
          'contextual-tours.37285cd763',
          'Pick the agent that should be opened when this worktree is created.'
        ),
        targetSelector: '[data-contextual-tour-target="workspace-creation-agent"]'
      }
    ]
  }
])

export function getContextualTour(id: ContextualTourId): ContextualTour {
  return getContextualTours().find((tour) => tour.id === id)!
}
