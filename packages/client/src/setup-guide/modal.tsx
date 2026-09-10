import { FEATURE_WALL_SETUP_STEP_IDS } from '@agentstart/protocol/telemetry/feature-wall/types'
import type { FeatureWallSetupStepId } from '@agentstart/protocol/telemetry/feature-wall/types'
import type { JSX } from 'react'
import { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { useUiLocale } from '~renderer/i18n/use-ui-locale'
import { EyeSlash as EyeOff } from '~renderer/icons/hugeicons'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import {
  getFirstIncompleteFeatureWallSetupStepId,
  getFeatureWallSetupSteps
} from '../feature-wall/content/setup-steps'
import { FeatureWallSetupChecklist } from '../feature-wall/setup-checklist'
import { SetupGuideProgressRing } from './progress-ring'
import { useSetupGuideProgress } from './use-setup-guide-progress'
import { useSetupGuideOpenCloseTelemetry } from './use-setup-guide-telemetry'

export default function SetupGuideModal(): JSX.Element | null {
  useUiLocale()
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const setSetupGuideSidebarDismissed = useAppStore((s) => s.setSetupGuideSidebarDismissed)
  const isOpen = activeModal === 'setup-guide'
  const setupSteps = getFeatureWallSetupSteps()
  const [orchestrationSkillInstalled, setOrchestrationSkillInstalled] = useState(false)
  const [browserUseSkillInstalled, setBrowserUseSkillInstalled] = useState(false)
  const progress = useSetupGuideProgress(
    isOpen,
    orchestrationSkillInstalled,
    browserUseSkillInstalled
  )
  const requestedStepId = isFeatureWallSetupStepId(modalData.setupStepId)
    ? modalData.setupStepId
    : null
  const firstIncompleteStepId = getFirstIncompleteFeatureWallSetupStepId(progress.stepDone)
  const [stepSelection, setStepSelection] = useState<{
    requestedStepId: FeatureWallSetupStepId | null
    selectedStepId: FeatureWallSetupStepId
    isUserSelected: boolean
    wasOpen: boolean
  }>(() => ({
    requestedStepId,
    selectedStepId: requestedStepId ?? firstIncompleteStepId,
    isUserSelected: false,
    wasOpen: isOpen
  }))
  if (!isOpen && stepSelection.wasOpen) {
    setStepSelection({
      requestedStepId,
      selectedStepId: requestedStepId ?? firstIncompleteStepId,
      isUserSelected: false,
      wasOpen: false
    })
  } else if (
    isOpen &&
    (!stepSelection.wasOpen || stepSelection.requestedStepId !== requestedStepId)
  ) {
    setStepSelection({
      requestedStepId,
      selectedStepId: requestedStepId ?? firstIncompleteStepId,
      isUserSelected: false,
      wasOpen: true
    })
  } else if (isOpen && !stepSelection.isUserSelected) {
    const requestedStepIsDone = requestedStepId !== null && progress.stepDone[requestedStepId]
    const automaticStepId = requestedStepIsDone
      ? firstIncompleteStepId
      : (requestedStepId ?? firstIncompleteStepId)
    if (stepSelection.selectedStepId !== automaticStepId) {
      setStepSelection({ ...stepSelection, selectedStepId: automaticStepId })
    }
  }
  const activeStepId = stepSelection.selectedStepId
  const telemetrySource =
    typeof modalData.setupGuideSource === 'string'
      ? modalData.setupGuideSource
      : typeof modalData.telemetrySource === 'string'
        ? modalData.telemetrySource
        : 'unknown'
  const activeStep = setupSteps.find((step) => step.id === activeStepId) ?? setupSteps[0] ?? null

  useSetupGuideOpenCloseTelemetry({
    isOpen,
    source: telemetrySource,
    progress,
    activeStepId: activeStep?.id ?? null
  })

  const handleSelectStep = (id: FeatureWallSetupStepId): void => {
    setStepSelection((current) => ({
      ...current,
      selectedStepId: id,
      isUserSelected: true
    }))
  }

  const handleOpenChange = (open: boolean): void => {
    if (!open) {
      closeModal()
    }
  }

  const handleHideFromSidebar = (): void => {
    setSetupGuideSidebarDismissed(true)
  }

  if (!isOpen) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="grid h-[min(780px,calc(100vh-2rem))] w-[min(1080px,calc(100vw-2rem))] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 p-0 sm:max-w-none"
        tabIndex={-1}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={translate(
                  'auto.components.setup.guide.SetupGuideModal.f3b5ffb2a6',
                  'Hide checklist from sidebar'
                )}
                onClick={handleHideFromSidebar}
                className="text-muted-foreground absolute top-3.5 right-10"
              >
                <EyeOff className="size-4" />
              </Button>
            }
          />
          <TooltipContent side="top" sideOffset={4}>
            {translate(
              'auto.components.setup.guide.SetupGuideModal.28cf59fcb4',
              'This will hide the checklist from the sidebar'
            )}
          </TooltipContent>
        </Tooltip>
        <DialogHeader className="border-border gap-1 border-b px-7 py-4">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-lg">
              {translate(
                'auto.components.setup.guide.SetupGuideModal.48a9e5ef2d',
                'Getting started'
              )}
            </DialogTitle>
            <SetupGuideProgressRing
              done={progress.coreDoneCount}
              total={progress.coreTotal}
              className="text-green-600 dark:text-green-300"
              sizeClassName="size-5"
            />
          </div>
          <DialogDescription className="text-muted-foreground text-sm">
            {translate(
              'auto.components.setup.guide.SetupGuideModal.3598a3ca0c',
              'Finish the core workflows that make AgentStart useful for parallel agent work.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-hidden px-7 py-6">
          <FeatureWallSetupChecklist
            activeStep={activeStep}
            progress={progress}
            onSelectStep={handleSelectStep}
            onOrchestrationSkillInstalledChange={setOrchestrationSkillInstalled}
            onBrowserUseSkillInstalledChange={setBrowserUseSkillInstalled}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function isFeatureWallSetupStepId(value: unknown): value is FeatureWallSetupStepId {
  return (
    typeof value === 'string' &&
    FEATURE_WALL_SETUP_STEP_IDS.includes(value as FeatureWallSetupStepId)
  )
}
