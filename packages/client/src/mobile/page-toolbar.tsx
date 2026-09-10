import { translate } from '~renderer/i18n/i18n'
import { X } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { mobilePageStyles } from './page-tailwind'

type MobilePageToolbarProps = {
  onClose: () => void
}

export function MobilePageToolbar({ onClose }: MobilePageToolbarProps): React.JSX.Element {
  return (
    <div className={mobilePageStyles.toolbar}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className={`${mobilePageStyles.toolbarClose} bg-background dark:bg-background dark:hover:bg-accent`}
              onClick={onClose}
              aria-label={translate(
                'auto.components.mobile.MobilePageToolbar.9883b58693',
                'Close AgentStart Mobile'
              )}
            >
              <X className="size-4" />
            </Button>
          }
        />
        <TooltipContent side="bottom" sideOffset={6}>
          {translate('auto.components.mobile.MobilePageToolbar.ad2284a9e2', 'Close · Esc')}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
