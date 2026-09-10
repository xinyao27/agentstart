import { translate } from '~renderer/i18n/i18n'
import { X } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { useMobileEmulatorTabIntroActions } from './use-mobile-emulator-tab-intro-actions'

export function MobileEmulatorTabIntroCallout(): React.JSX.Element {
  const { keepIntro, hideIntro, dismissIntro } = useMobileEmulatorTabIntroActions()

  return (
    <div
      className="mobile-emulator-tab-intro-callout--menu border-border/70 bg-muted dark:bg-accent/80 mt-1 flex items-center gap-2 rounded-lg border-x border-b px-2 py-1.5"
      // Why: Radix dropdown treats pointer-down inside custom panels as an
      // outside-select; keep the menu open while the user reads or acts on the
      // Keep/Hide/Dismiss controls (the actions intentionally leave it open).
      onPointerDown={(event) => event.preventDefault()}
    >
      <p className="text-foreground/85 min-w-0 flex-1 text-[11px] leading-4">
        {translate(
          'auto.components.emulator.pane.MobileEmulatorTabIntroCallout.5789936d9a',
          'Preview iOS simulators while agents drive the screen.'
        )}
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[11px]"
          onClick={keepIntro}
        >
          {translate(
            'auto.components.emulator.pane.MobileEmulatorTabIntroCallout.8014b4b80b',
            'Keep'
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-muted-foreground h-6 px-2 text-[11px]"
          onClick={hideIntro}
        >
          {translate(
            'auto.components.emulator.pane.MobileEmulatorTabIntroCallout.6e051a40b7',
            'Hide'
          )}
        </Button>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={translate(
                  'auto.components.emulator.pane.MobileEmulatorTabIntroCallout.1924982130',
                  'Dismiss'
                )}
                className="text-muted-foreground size-6"
                onClick={dismissIntro}
              >
                <X className="size-3" />
              </Button>
            }
          />
          <TooltipContent side="top" sideOffset={4}>
            {translate(
              'auto.components.emulator.pane.MobileEmulatorTabIntroCallout.1924982130',
              'Dismiss'
            )}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
