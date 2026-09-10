import type { OnboardingState } from '@agentstart/protocol/settings/onboarding'
import { useEffect, useRef, useState } from 'react'
import { applyDocumentTheme } from '~renderer/editor/document-theme'
import { translate } from '~renderer/i18n/i18n'
import { isEditableTarget } from '~renderer/keyboard-input/editable-target'
import {
  getScreenSubmitModifierLabel,
  isScreenSubmitShortcut
} from '~renderer/keyboard-input/screen-submit-shortcut'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~renderer/ui/tooltip'

import { AgentStep } from './agent-step'
import { shouldRequestOnboardingSkipConfirmation } from './dismiss-target'
import { OnboardingFooter } from './footer'
import { IntegrationsStep } from './integrations-step'
import { NotificationStep } from './notification-step'
import { OnboardingSkipConfirmationDialog } from './skip-confirmation-dialog'
import { ThemeStep } from './theme-step'
import { useOnboardingFlow } from './use-onboarding-flow'
import { WindowsTerminalStep } from './windows-terminal-step'

const stepCopy = {
  agent: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.198b148b3c',
        'Pick your default agent'
      )
    },
    get subtitle() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.322fc50a18',
        "AgentStart works with every CLI agent. Choose the one you'll reach for most. Switch any time."
      )
    }
  },
  theme: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.f396db9f20',
        'Make it feel like home'
      )
    },
    get subtitle() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.04ae28d8ca',
        'Pick the look you want to stare at for hours.'
      )
    }
  },
  notifications: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.b054332836',
        'Set up notifications'
      )
    },
    get subtitle() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.ff92d15436',
        'AgentStart will notify you when agents are done or need help.'
      )
    }
  },
  integrations: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.ae3b00ca82',
        'Set up GitHub reviews'
      )
    },
    get subtitle() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.97c42cda00',
        'Install the GitHub CLI to:'
      )
    }
  },
  windows_terminal: {
    get title() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.windowsTerminalTitle',
        'Set Windows terminal defaults'
      )
    },
    get subtitle() {
      return translate(
        'auto.components.onboarding.OnboardingFlow.windowsTerminalSubtitle',
        'Choose the DEFAULT Shell for new panes and how right-click behaves in the terminal.'
      )
    }
  }
} as const

const stepTooltipLabels = {
  agent: 'Default Agent',
  theme: 'Appearance',
  windows_terminal: 'Windows Terminal',
  notifications: 'Notifications',
  integrations: 'Integrations'
} as const

type OnboardingFlowProps = {
  onboarding: OnboardingState
  onOnboardingChange: (state: OnboardingState) => void
}

export default function OnboardingFlow({
  onboarding,
  onOnboardingChange
}: OnboardingFlowProps): React.JSX.Element {
  const flow = useOnboardingFlow(onboarding, onOnboardingChange)
  const continueShortcutModifierLabel = getScreenSubmitModifierLabel()
  const { currentStep, stepIndex, busyLabel } = flow
  const copy = stepCopy[currentStep.id]
  const shouldShowSkipToProjectSetup = currentStep.id !== 'notifications'
  const shouldShowFooterBusy = Boolean(busyLabel)
  const footerPrimaryLabel =
    busyLabel ?? (currentStep.id === 'notifications' ? 'Add your first project' : 'Continue')
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false)
  const skipConfirmAdvancedViaRef = useRef<'button' | 'keyboard'>('button')
  const { next: flowNext, dismissOnboarding: flowDismissOnboarding } = flow

  const requestSkipConfirmation = useEventCallback((advancedVia: 'button' | 'keyboard') => {
    // Why: click-off / Escape dismissal stays available on every step,
    // including the final notifications step, so the modal never feels stuck.
    if (busyLabel || skipConfirmOpen) {
      return
    }
    skipConfirmAdvancedViaRef.current = advancedVia
    setSkipConfirmOpen(true)
  })

  const confirmSkipOnboarding = () => {
    const advancedVia = skipConfirmAdvancedViaRef.current
    setSkipConfirmOpen(false)
    void flowDismissOnboarding(advancedVia)
  }

  // Why: depend on stable callbacks + step id only so the listener doesn't
  // re-bind on every render of the parent (flow object identity changes).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Why: don't hijack Enter / Cmd+Enter while the user is typing into the
      // clone-URL input or any other editable field on a step.
      if (isEditableTarget(event.target)) {
        return
      }
      // Why: onboarding continue is screen-local submit behavior, not a
      // user-configurable app command.
      if (!isScreenSubmitShortcut(event)) {
        return
      }
      event.preventDefault()
      void flowNext('keyboard')
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [flowNext])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || skipConfirmOpen) {
        return
      }
      event.preventDefault()
      requestSkipConfirmation('keyboard')
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [requestSkipConfirmation, skipConfirmOpen])

  useEffect(() => () => applyDocumentTheme(useAppStore.getState().settings?.theme ?? 'dark'), [])

  return (
    <TooltipProvider timeout={0}>
      {/* Why: modal backdrops intentionally reveal and dim the app beneath;
          unlike foreground surfaces, this alpha is part of the interaction. */}
      <div
        className="text-foreground fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/50 p-4 backdrop-blur-[2px]"
        data-onboarding-overlay
        onPointerDown={(event) => {
          if (!shouldRequestOnboardingSkipConfirmation(event)) {
            return
          }
          requestSkipConfirmation('button')
        }}
      >
        <section
          role="dialog"
          aria-label={translate(
            'auto.components.onboarding.OnboardingFlow.277ba45540',
            'AgentStart onboarding'
          )}
          aria-modal="true"
          data-onboarding-modal
          className={cn(
            'relative flex h-[calc(100vh-2rem)] max-h-[960px] min-h-0 w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground transition-[max-width] duration-[760ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
            'max-w-[1100px]'
          )}
        >
          <div className="relative flex h-full min-h-0 flex-col px-6 pt-8 pb-6 sm:px-8 sm:pt-9 sm:pb-8">
            <div className="flex items-center gap-2">
              {flow.progressSteps.map(({ step, index: realStepIndex }, progressIdx) => {
                const isActive = realStepIndex === stepIndex
                const isDone = realStepIndex < stepIndex
                return (
                  <Tooltip key={step.id}>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          type="button"
                          className={cn(
                            // Why: the visible bars stay 4px tall, but the invisible
                            // hit area makes hover/click/tooltip targeting reliable.
                            'border-0 relative h-1 duration-300 before:absolute before:-inset-y-2 before:-inset-x-1 focus-visible:bg-foreground',
                            isActive
                              ? 'w-10 bg-foreground'
                              : isDone
                                ? 'w-6 bg-muted-foreground/70 hover:bg-foreground/80'
                                : 'w-6 bg-muted-foreground/25 hover:bg-muted-foreground/45'
                          )}
                          aria-label={translate(
                            'auto.components.onboarding.OnboardingFlow.adaa0aa627',
                            'Go to onboarding step {{value0}}: {{value1}}',
                            { value0: progressIdx + 1, value1: stepTooltipLabels[step.id] }
                          )}
                          aria-current={isActive ? 'step' : undefined}
                          onClick={() => flow.jumpToStep(realStepIndex)}
                        />
                      }
                    />
                    <TooltipContent side="top" sideOffset={8} style={{ zIndex: 110 }}>
                      {stepTooltipLabels[step.id]}
                    </TooltipContent>
                  </Tooltip>
                )
              })}
              <span className="text-muted-foreground ml-3 text-xs font-medium">
                {flow.progressStepIndex + 1}{' '}
                {translate('auto.components.onboarding.OnboardingFlow.4db04f2f57', 'of')}{' '}
                {flow.progressSteps.length}
              </span>
            </div>

            <div className="mt-8 shrink-0">
              {stepIndex === 0 && (
                <div className="text-muted-foreground mb-2 text-xs font-medium tracking-[0.18em] uppercase">
                  {translate(
                    'auto.components.onboarding.OnboardingFlow.1b5e182e9f',
                    'Welcome to AgentStart'
                  )}
                </div>
              )}
              <h1 className="text-foreground text-[34px] leading-[1.15] font-semibold tracking-tight">
                {copy.title}
              </h1>
              {copy.subtitle ? (
                <p className="text-muted-foreground mt-3 text-[15px] leading-relaxed">
                  {copy.subtitle}
                </p>
              ) : null}
            </div>

            <div
              className={cn(
                'min-h-0 flex-1 transition-[margin-top] duration-[760ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                // Why: agent step pins permissions below a capped agent grid scroll
                // region; other steps keep the shared outer scroll container.
                currentStep.id === 'agent'
                  ? 'mt-10 flex flex-col overflow-hidden'
                  : cn('scrollbar-sleek overflow-y-auto pr-1', 'mt-10')
              )}
            >
              {currentStep.id === 'agent' && (
                <AgentStep
                  selectedAgent={flow.selectedAgent}
                  onSelect={flow.setSelectedAgent}
                  detectedSet={flow.detectedSet}
                  isDetecting={flow.isDetectingAgents}
                  yoloPermissions={flow.yoloPermissions}
                  onYoloPermissionsChange={flow.setYoloPermissions}
                />
              )}
              {currentStep.id === 'theme' && (
                <ThemeStep
                  theme={flow.theme}
                  onThemeChange={flow.setTheme}
                  settings={flow.settings}
                  updateSettings={flow.updateSettings}
                />
              )}
              {currentStep.id === 'notifications' && (
                <NotificationStep settings={flow.settings} updateSettings={flow.updateSettings} />
              )}
              {currentStep.id === 'integrations' && <IntegrationsStep />}
              {currentStep.id === 'windows_terminal' && (
                <WindowsTerminalStep
                  settings={flow.settings}
                  updateSettings={flow.updateSettings}
                />
              )}
            </div>

            <OnboardingFooter
              shouldShowSkipToProjectSetup={shouldShowSkipToProjectSetup}
              busyLabel={busyLabel}
              onSkipToRepo={() => void flow.skipToRepo()}
              stepIndex={stepIndex}
              onBack={flow.nestedScan ? flow.cancelNested : flow.back}
              showPrimary
              primaryBusy={shouldShowFooterBusy}
              primaryLabel={footerPrimaryLabel}
              shortcutModifierLabel={continueShortcutModifierLabel}
              onPrimary={() => void flow.next()}
            />
          </div>
        </section>
        <OnboardingSkipConfirmationDialog
          open={skipConfirmOpen}
          onOpenChange={setSkipConfirmOpen}
          onSkip={confirmSkipOnboarding}
        />
      </div>
    </TooltipProvider>
  )
}
