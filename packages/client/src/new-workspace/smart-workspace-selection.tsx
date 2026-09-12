import { openHttpLink } from '~renderer/editor/http-link-routing'
import { translate } from '~renderer/i18n/i18n'
import { ArrowSquareOut as ExternalLink, X } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import {
  SmartWorkspaceSelectionIcon,
  type SmartWorkspaceNameSelection
} from './smart-workspace-name-rows'

type SmartWorkspaceSelectionProps = {
  onClear: () => void
  onPlainEnter?: () => void
  selection: SmartWorkspaceNameSelection
  setNode: (node: HTMLDivElement | null) => void
}

export function SmartWorkspaceSelection({
  onClear,
  onPlainEnter,
  selection,
  setNode
}: SmartWorkspaceSelectionProps): React.JSX.Element {
  return (
    <div
      ref={setNode}
      data-workspace-source-pill="true"
      tabIndex={0}
      onKeyDown={(event) => {
        if (
          event.currentTarget !== event.target ||
          event.key !== 'Enter' ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return
        }
        event.preventDefault()
        onPlainEnter?.()
      }}
      className="border-input focus-within:border-ring flex h-9 w-full min-w-0 items-center gap-2 rounded-md border bg-transparent px-2.5 text-sm outline-none"
    >
      <SmartWorkspaceSelectionIcon kind={selection.kind} />
      <span className="text-foreground min-w-0 flex-1 truncate leading-none font-medium">
        {selection.label}
      </span>
      {selection.url ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="quiet"
                size="icon-xs"
                onClick={(event) => openHttpLink(selection.url!, { event })}
                className="size-6 shrink-0"
                aria-label={translate(
                  'auto.components.new.workspace.SmartWorkspaceNameField.2c69728c2a',
                  'Open link in browser'
                )}
              >
                <ExternalLink className="size-3.5" />
              </Button>
            }
          />
          <TooltipContent side="top" sideOffset={6}>
            {translate(
              'auto.components.new.workspace.SmartWorkspaceNameField.370a1faf67',
              'Open in browser'
            )}
          </TooltipContent>
        </Tooltip>
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="quiet"
              size="icon-xs"
              onClick={onClear}
              className="size-6 shrink-0"
              aria-label={translate(
                'auto.components.new.workspace.SmartWorkspaceNameField.7199ff19c7',
                'Clear selected source'
              )}
            >
              <X className="size-3.5" />
            </Button>
          }
        />
        <TooltipContent side="top" sideOffset={6}>
          {translate('auto.components.new.workspace.SmartWorkspaceNameField.0c9e668e3a', 'Clear')}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
