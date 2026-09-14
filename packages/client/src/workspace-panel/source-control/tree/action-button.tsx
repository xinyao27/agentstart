import React from 'react'
import { Button } from '~renderer/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

type ActionButtonProps = {
  icon: React.ComponentType<{ className?: string }>
  title: string
  onClick: (event: React.MouseEvent) => void
  disabled?: boolean
  surface?: 'header' | 'row'
}

export function ActionButton(props: ActionButtonProps): React.JSX.Element {
  const { icon: Icon, title, onClick, disabled, surface = 'header' } = props
  // Why: use the root tooltip provider for sibling delay handoff, and keep the
  // trigger interactive because Chromium suppresses tooltips on disabled buttons.
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={surface === 'row' ? 'row-action' : 'sidebar-outline'}
            size="icon-xs"
            aria-label={title}
            aria-disabled={disabled}
            onClick={(event) => {
              if (disabled) {
                event.preventDefault()
                return
              }
              onClick(event)
            }}
          >
            <Icon className="size-3.5" />
          </Button>
        }
      />
      <TooltipContent
        side={surface === 'header' ? 'bottom' : 'top'}
        sideOffset={surface === 'header' ? 6 : 4}
      >
        {title}
      </TooltipContent>
    </Tooltip>
  )
}
