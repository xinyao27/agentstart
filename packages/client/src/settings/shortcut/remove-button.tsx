import type { KeybindingActionId } from '@yiru/protocol/keybindings'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { X } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

// Removes one binding from an action. The hover-reveal wrapper lives in the
// parent row so it can key off that row's hover group (the header row and the
// sub-rows use different group names).
export function ShortcutRemoveButton({
  actionId,
  title,
  bindingIndex,
  onRemove
}: {
  actionId: KeybindingActionId
  title: string
  bindingIndex: number
  onRemove: (actionId: KeybindingActionId, index: number) => void
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-destructive"
            aria-label={translate(
              'auto.components.settings.ShortcutRemoveButton.9e29aff18b',
              'Remove {{value0}} shortcut {{value1}}',
              { value0: title, value1: String(bindingIndex + 1) }
            )}
            onClick={() => onRemove(actionId, bindingIndex)}
          >
            <X className="size-3" />
          </Button>
        }
      />
      <TooltipContent side="top" sideOffset={4}>
        {translate(
          'auto.components.settings.ShortcutRemoveButton.2a9588b1c2',
          'Remove this binding'
        )}
      </TooltipContent>
    </Tooltip>
  )
}
