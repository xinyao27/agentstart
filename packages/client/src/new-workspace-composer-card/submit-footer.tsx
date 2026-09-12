import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { ArrowElbowDownLeft as CornerDownLeft } from '~renderer/icons/hugeicons'
import { getScreenSubmitModifierLabel } from '~renderer/keyboard-input/screen-submit-shortcut'
import { LoadingIndicator } from '~renderer/loading/indicator'
import type { WorkspaceCreateErrorDisplay } from '~renderer/new-workspace-composer-card/workspace-create-error-format'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Switch } from '~renderer/ui/switch'

type SubmitFooterProps = {
  createError: WorkspaceCreateErrorDisplay | null
  showCreateMultiple?: boolean
  createMultiple?: boolean
  onCreateMultipleChange?: (next: boolean) => void
  primaryActionLabel: string
  creating: boolean
  createDisabled: boolean
  onCreate: () => void
}

export function SubmitFooter({
  createError,
  showCreateMultiple = false,
  createMultiple = false,
  onCreateMultipleChange,
  primaryActionLabel,
  creating,
  createDisabled,
  onCreate
}: SubmitFooterProps): React.JSX.Element {
  const submitShortcutModifierLabel = getScreenSubmitModifierLabel()

  return (
    <>
      {createError ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-xs"
        >
          {createError.help ? (
            <div className="space-y-1">
              <p className="font-medium">{createError.title}</p>
              <p>{createError.message}</p>
              <p className="text-destructive/85">{createError.help}</p>
            </div>
          ) : (
            createError.message
          )}
        </div>
      ) : null}

      <div
        className={cn(
          'flex items-center gap-3',
          showCreateMultiple ? 'justify-between' : 'justify-end'
        )}
      >
        {showCreateMultiple ? (
          <div className="flex items-center gap-2">
            <Switch
              checked={createMultiple}
              onCheckedChange={(checked) => onCreateMultipleChange?.(checked)}
              aria-label={translate(
                'auto.components.NewWorkspaceComposerCard.createMultiple',
                'Create more'
              )}
            />
            <span className="text-muted-foreground">
              {translate('auto.components.NewWorkspaceComposerCard.createMultiple', 'Create more')}
            </span>
          </div>
        ) : null}
        <Button
          onClick={() => void onCreate()}
          disabled={createDisabled}
          size="sm"
          className="text-xs"
        >
          {creating ? <LoadingIndicator className="size-4" /> : null}
          {primaryActionLabel}
          <span className="ml-1 inline-flex items-center gap-0.5 rounded-sm border border-current/20 px-1.5 py-0.5 text-[10px] leading-none font-medium text-current/80">
            <span>{submitShortcutModifierLabel}</span>
            <CornerDownLeft className="size-3" />
          </span>
        </Button>
      </div>
    </>
  )
}
