import type { AgentsStep } from './content/agents-orchestration-steps'
import type { ReviewStep } from './content/review-steps'
import type { WorkbenchStep } from './content/workbench-steps'
import type { FeatureWallActiveStepCopy } from './tour-panel'

export function getFeatureWallActiveStepCopy(
  agentsActiveStep: AgentsStep | null,
  workbenchActiveStep: WorkbenchStep | null,
  reviewActiveStep: ReviewStep | null
): FeatureWallActiveStepCopy | null {
  const activeStep = agentsActiveStep ?? workbenchActiveStep ?? reviewActiveStep
  if (!activeStep) {
    return null
  }
  return {
    title: activeStep.subtitle,
    description: activeStep.description,
    optional: 'optional' in activeStep && activeStep.optional === true
  }
}
