import { translate } from '~renderer/i18n/i18n'
import {
  CaretLeft as ChevronLeft,
  ArrowElbowDownLeft as CornerDownLeft
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'

type OnboardingFooterProps = {
  shouldShowSkipToProjectSetup: boolean
  busyLabel: string | null
  onSkipToRepo: () => void
  stepIndex: number
  onBack: () => void
  showPrimary: boolean
  primaryBusy: boolean
  primaryLabel: string
  shortcutModifierLabel: string
  onPrimary: () => void
}

export function OnboardingFooter({
  shouldShowSkipToProjectSetup,
  busyLabel,
  onSkipToRepo,
  stepIndex,
  onBack,
  showPrimary,
  primaryBusy,
  primaryLabel,
  shortcutModifierLabel,
  onPrimary
}: OnboardingFooterProps): React.JSX.Element {
  return (
    <footer className="border-border mt-6 flex flex-none items-center justify-between border-t pt-5">
      {shouldShowSkipToProjectSetup ? (
        <Button
          variant="quiet"
          size="default"
          className="disabled:hover:text-muted-foreground px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          disabled={Boolean(busyLabel)}
          onClick={onSkipToRepo}
        >
          {translate(
            'auto.components.onboarding.OnboardingFooter.111d3f8d92',
            'Skip to project setup'
          )}
        </Button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">
        {stepIndex > 0 && (
          <Button
            variant="outline"
            size="default"
            className="bg-muted/60 hover:bg-muted focus-visible:bg-muted gap-1 px-3 text-sm disabled:opacity-60"
            disabled={Boolean(busyLabel)}
            onClick={onBack}
          >
            <ChevronLeft className="size-4" />
            {translate('auto.components.onboarding.OnboardingFooter.ba58547306', 'Back')}
          </Button>
        )}
        {showPrimary && (
          <Button
            variant="default"
            size="default"
            className="hover:bg-primary/90 focus-visible:bg-primary/90 px-5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            aria-busy={primaryBusy}
            disabled={Boolean(busyLabel)}
            onClick={onPrimary}
          >
            {primaryBusy ? <LoadingIndicator className="size-4" /> : null}
            {primaryLabel}
            <span className="border-primary-foreground/20 ml-1 inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] leading-none font-medium text-current/80">
              <span>{shortcutModifierLabel}</span>
              <CornerDownLeft className="size-3" />
            </span>
          </Button>
        )}
      </div>
    </footer>
  )
}
