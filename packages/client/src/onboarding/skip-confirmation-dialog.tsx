import { translate } from '~renderer/i18n/i18n'
import { Button } from '~renderer/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'

const ONBOARDING_SKIP_CONFIRMATION_COPY = {
  get title() {
    return translate(
      'auto.components.onboarding.OnboardingSkipConfirmationDialog.e4726b2d50',
      'Skip onboarding?'
    )
  },
  get description() {
    return translate(
      'auto.components.onboarding.OnboardingSkipConfirmationDialog.9f47f345a4',
      "It won't take long!"
    )
  },
  skipLabel: 'Skip',
  keepGoingLabel: 'No, keep going'
} as const

export function OnboardingSkipConfirmationDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSkip: () => void
}): React.JSX.Element {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {/* Why: this nested confirmation needs a lighter translucent backdrop
          so the onboarding context remains visible behind the modal. */}
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[120] bg-black/35"
        className="z-[130] sm:max-w-[360px]"
      >
        <DialogHeader>
          <DialogTitle>{ONBOARDING_SKIP_CONFIRMATION_COPY.title}</DialogTitle>
          <DialogDescription>{ONBOARDING_SKIP_CONFIRMATION_COPY.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={props.onSkip}>
            {ONBOARDING_SKIP_CONFIRMATION_COPY.skipLabel}
          </Button>
          <Button type="button" onClick={() => props.onOpenChange(false)}>
            {ONBOARDING_SKIP_CONFIRMATION_COPY.keepGoingLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
