import type { FeatureWallSetupStepId } from '@agentstart/protocol/telemetry/feature-wall/types'
import { useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { useUiLocale } from '~renderer/i18n/use-ui-locale'
import { ArrowCounterClockwise } from '~renderer/icons/hugeicons'
import { showOnboardingFromRenderer } from '~renderer/onboarding/show-onboarding-event'
import { Button } from '~renderer/ui/button'

import {
  getFeatureWallSetupSteps,
  getFirstIncompleteFeatureWallSetupStepId
} from '../feature-wall/content/setup-steps'
import { FeatureWallSetupChecklist } from '../feature-wall/setup-checklist'
import { useSettingsSetupGuideFullProgress } from './setup-guide-progress'

export function SettingsSetupGuidePane(): React.JSX.Element {
  useUiLocale()
  const setupSteps = getFeatureWallSetupSteps()
  const [isRestartingOnboarding, setIsRestartingOnboarding] = useState(false)
  const [orchestrationSkillInstalled, setOrchestrationSkillInstalled] = useState(false)
  const [browserUseSkillInstalled, setBrowserUseSkillInstalled] = useState(false)
  const progress = useSettingsSetupGuideFullProgress(
    true,
    orchestrationSkillInstalled,
    browserUseSkillInstalled
  )
  const [selectedStepId, setSelectedStepId] = useState<FeatureWallSetupStepId | null>(null)
  const activeStepId = selectedStepId ?? getFirstIncompleteFeatureWallSetupStepId(progress.stepDone)
  const activeStep = setupSteps.find((step) => step.id === activeStepId) ?? setupSteps[0] ?? null

  const handleSelectStep = (id: FeatureWallSetupStepId): void => {
    setSelectedStepId(id)
  }

  const handleRestartOnboarding = async (): Promise<void> => {
    if (isRestartingOnboarding) {
      return
    }
    setIsRestartingOnboarding(true)
    try {
      await showOnboardingFromRenderer()
    } catch {
      toast.error(
        translate(
          'auto.components.settings.SettingsSetupGuidePane.restartOnboardingError',
          "Couldn't restart onboarding."
        )
      )
    } finally {
      setIsRestartingOnboarding(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col">
      <div className="border-border/60 mb-6 flex shrink-0 flex-wrap items-center justify-between gap-4 border-b pb-5">
        <div className="min-w-0 space-y-1">
          <h3 className="text-foreground text-sm font-semibold">
            {translate(
              'auto.components.settings.SettingsSetupGuidePane.restartOnboardingTitle',
              'Run onboarding again'
            )}
          </h3>
          <p className="text-muted-foreground text-xs leading-5">
            {translate(
              'auto.components.settings.SettingsSetupGuidePane.restartOnboardingDescription',
              'Reset the onboarding wizard and reopen it from the first step. Your checklist progress stays intact.'
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={isRestartingOnboarding}
          onClick={() => void handleRestartOnboarding()}
        >
          <ArrowCounterClockwise className="size-3.5" />
          {translate(
            'auto.components.settings.SettingsSetupGuidePane.restartOnboardingButton',
            'Restart onboarding'
          )}
        </Button>
      </div>
      <div>
        <FeatureWallSetupChecklist
          layout="embedded"
          activeStep={activeStep}
          progress={progress}
          onSelectStep={handleSelectStep}
          onOrchestrationSkillInstalledChange={setOrchestrationSkillInstalled}
          onBrowserUseSkillInstalledChange={setBrowserUseSkillInstalled}
        />
      </div>
    </div>
  )
}
