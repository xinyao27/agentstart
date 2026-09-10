import { FEATURE_WALL_SETUP_STEP_IDS } from '@agentstart/protocol/telemetry/feature-wall/types'
import type { FeatureWallSetupStepId } from '@agentstart/protocol/telemetry/feature-wall/types'
import { translate } from '~renderer/i18n/i18n'
import { createLocalizedCatalog } from '~renderer/i18n/localized-catalog'

export type FeatureWallSetupStep = {
  readonly id: FeatureWallSetupStepId
  readonly name: string
  readonly subtitle: string
  readonly description: string
}

const FEATURE_WALL_SETUP_PARALLEL_WORK_STEP_IDS = [
  'two-worktrees',
  'browser'
] as const satisfies readonly FeatureWallSetupStepId[]

export type FeatureWallSetupSectionId = 'parallel-work' | 'setup'

export const getFeatureWallSetupSteps = createLocalizedCatalog(
  (): readonly FeatureWallSetupStep[] => [
    {
      id: 'two-worktrees',
      name: translate('feature-wall.093885fbec', 'Multi-task'),
      subtitle: translate('feature-wall.093885fbec', 'Multi-task'),
      description: translate(
        'feature-wall.709b371089',
        'Work in 2 different worktrees at once. Each one is isolated (even in the same project). Perfect for working on 2 features at once.'
      )
    },
    {
      id: 'browser',
      name: translate('feature-wall.7e1fbc831b', "Use AgentStart's browser"),
      subtitle: translate('feature-wall.7e1fbc831b', "Use AgentStart's browser"),
      description: translate(
        'feature-wall.72a691c081',
        'Browse your web app without leaving AgentStart. Grab any element and send its exact source and styles to an agent with one click.'
      )
    },
    {
      id: 'notifications',
      name: translate('feature-wall.5ab087ec11', 'Turn on notifications'),
      subtitle: translate('feature-wall.5ab087ec11', 'Turn on notifications'),
      description: translate(
        'feature-wall.2935db9586',
        'Know the moment an agent finishes, needs attention, or gets blocked.'
      )
    },
    {
      id: 'default-agent',
      name: translate('feature-wall.9a739e27d2', 'Choose your default agent'),
      subtitle: translate('feature-wall.9a739e27d2', 'Choose your default agent'),
      description: translate(
        'feature-wall.70593204ec',
        'Start new work faster with your preferred agent already selected.'
      )
    },
    {
      id: 'agent-capabilities',
      name: translate('feature-wall.c0feda1125', 'Enable AgentStart CLI'),
      subtitle: translate('feature-wall.c0feda1125', 'Enable AgentStart CLI'),
      description: translate(
        'feature-wall.b56f64241a',
        'Register the AgentStart shell command and install agent skills for browser, computer, and orchestration workflows.'
      )
    },
    {
      id: 'setup-script',
      name: translate('feature-wall.f626e0facc', 'Automate workspace setup'),
      subtitle: translate('feature-wall.f626e0facc', 'Automate workspace setup'),
      description: translate(
        'feature-wall.a6ab426046',
        'Run install and setup commands automatically so every new worktree is ready for agents.'
      )
    },
    {
      id: 'add-two-repos',
      name: translate('feature-wall.96402c9d0a', 'Start work in multiple repos'),
      subtitle: translate('feature-wall.96402c9d0a', 'Start work in multiple repos'),
      description: translate(
        'feature-wall.c88e5adc13',
        'Bring your key repos into AgentStart so you can start agent work without hunting for folders.'
      )
    }
  ]
)

export function getFeatureWallSetupSectionId(
  stepId: FeatureWallSetupStepId
): FeatureWallSetupSectionId {
  return FEATURE_WALL_SETUP_PARALLEL_WORK_STEP_IDS.some((id) => id === stepId)
    ? 'parallel-work'
    : 'setup'
}

export function getFeatureWallSetupStepsForSection(
  sectionId: FeatureWallSetupSectionId
): readonly FeatureWallSetupStep[] {
  return getFeatureWallSetupSteps().filter(
    (step) => getFeatureWallSetupSectionId(step.id) === sectionId
  )
}

export function getFirstIncompleteFeatureWallSetupStepId(
  stepDone: Partial<Record<FeatureWallSetupStepId, boolean>>
): FeatureWallSetupStepId {
  // Why: onboarding should prioritize Setup, while durable definitions retain the original order.
  const setupStep = getFeatureWallSetupStepsForSection('setup').find((step) => !stepDone[step.id])
  if (setupStep) {
    return setupStep.id
  }
  const parallelStep = getFeatureWallSetupStepsForSection('parallel-work').find(
    (step) => !stepDone[step.id]
  )
  return parallelStep?.id ?? getFeatureWallSetupSteps()[0].id
}

export function isFeatureWallSetupStepId(value: unknown): value is FeatureWallSetupStepId {
  return typeof value === 'string' && FEATURE_WALL_SETUP_STEP_IDS.some((id) => id === value)
}
