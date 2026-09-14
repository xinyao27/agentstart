import React from 'react'
import type { Icon } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { WORKSPACE_PANEL_BUTTON_SURFACE_CLASS_NAME } from '../workspace-panel-button-styles'

export function SourceControlHeaderIconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  variant = 'outline'
}: {
  icon: Icon
  label: string
  onClick: () => void
  disabled?: boolean
  variant?: 'ghost' | 'outline'
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={variant}
            size="icon-toolbar"
            className={WORKSPACE_PANEL_BUTTON_SURFACE_CLASS_NAME}
            aria-label={label}
            onClick={onClick}
            disabled={disabled}
          >
            <Icon className="size-3.5" />
          </Button>
        }
      />
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
