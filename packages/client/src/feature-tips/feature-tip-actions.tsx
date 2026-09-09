import type { JSX } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'

import type { FeatureTip, FeatureTipAction } from './catalog'

function getPrimaryBusyLabel(action: FeatureTipAction): string {
  if (action === 'setup-cli') {
    return 'Installing...'
  }
  return 'Working...'
}

export function FeatureTipActions({
  currentTip,
  primaryBusy,
  onPrimaryAction,
  onSkip,
  showSkip = true,
  fullWidth = false
}: {
  currentTip: FeatureTip
  primaryBusy: boolean
  onPrimaryAction: () => void
  onSkip: () => void
  showSkip?: boolean
  fullWidth?: boolean
}): JSX.Element {
  return (
    <>
      {showSkip ? (
        <Button variant="ghost" onClick={onSkip} disabled={primaryBusy}>
          {translate('auto.components.feature.tips.FeatureTipActions.eb04abece8', 'Maybe Later')}
        </Button>
      ) : null}
      <Button
        className={fullWidth ? 'w-full' : undefined}
        onClick={onPrimaryAction}
        disabled={primaryBusy}
      >
        {primaryBusy ? (
          <>
            <LoadingIndicator className="size-4" />
            {getPrimaryBusyLabel(currentTip.action)}
          </>
        ) : (
          currentTip.ctaLabel
        )}
      </Button>
    </>
  )
}
