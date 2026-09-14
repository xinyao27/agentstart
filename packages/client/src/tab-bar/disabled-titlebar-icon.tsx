import { translate } from '~renderer/i18n/i18n'
import { Button } from '~renderer/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

/** The reason a titlebar control is inert when no workspace is open. */
export function noWorkspaceReason(): string {
  return translate('auto.components.AppScopeStrip.requiresWorkspace', 'Create a workspace first')
}

/**
 * Why: the titlebar's workspace actions stay in place with no workspace open so
 * the strip's left and right edges never move — they go inert instead of
 * unmounting. `aria-disabled` rather than `disabled` keeps the button focusable
 * and hoverable, which is what lets the tooltip explain why it does nothing;
 * the class list mirrors the disabled trigger in `WorkspaceTabCreateMenu`.
 */
export function DisabledTitlebarIcon({
  icon,
  label
}: {
  icon: React.ReactNode
  label: string
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-disabled="true"
            className="hover:bg-background hover:text-muted-foreground cursor-not-allowed opacity-50"
            onPointerDown={(event) => event.preventDefault()}
            onClick={(event) => event.preventDefault()}
          >
            {icon}
          </Button>
        }
      />
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
