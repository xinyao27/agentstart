import {
  normalizeRepoBadgeColor,
  resolveRepoBadgeColor
} from '@agentstart/protocol/project/appearance'
import * as React from 'react'
import { HexColorPicker } from 'react-colorful'
import { translate } from '~renderer/i18n/i18n'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Input } from '~renderer/ui/input'
import { Label } from '~renderer/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '~renderer/ui/popover'

type RepoColorPickerProps = {
  value: string
  onChange: (value: string) => void
  label: string
  className?: string
  defaultOpen?: boolean
  selected?: boolean
  triggerLabel?: string
  showHexInTrigger?: boolean
}

const FULL_HEX_COLOR_PATTERN = /^#?[0-9a-fA-F]{6}$/

export function RepoColorPicker({
  value,
  onChange,
  label,
  className,
  defaultOpen,
  selected,
  triggerLabel,
  showHexInTrigger
}: RepoColorPickerProps): React.JSX.Element {
  const inputId = React.useId()
  const currentColor = resolveRepoBadgeColor(value)
  const [draftState, setDraftState] = React.useState(() => ({
    syncedColor: currentColor,
    draft: currentColor,
    isEditing: false
  }))
  const draft =
    draftState.isEditing || draftState.syncedColor === currentColor
      ? draftState.draft
      : currentColor
  const draftColor = normalizeRepoBadgeColor(draft)
  const swatchColor = draftColor ?? currentColor
  const hasInvalidDraft = draft.trim().length > 0 && !draftColor
  const shouldShowTriggerHex = showHexInTrigger ?? !triggerLabel

  const updateDraft = (nextDraft: string): void => {
    const nextColor = normalizeRepoBadgeColor(nextDraft)
    setDraftState({ syncedColor: currentColor, draft: nextDraft, isEditing: true })
    if (nextColor && FULL_HEX_COLOR_PATTERN.test(nextDraft.trim())) {
      onChange(nextColor)
    }
  }

  const updateColor = (nextColor: string): void => {
    const normalized = resolveRepoBadgeColor(nextColor)
    setDraftState({ syncedColor: currentColor, draft: normalized, isEditing: true })
    onChange(normalized)
  }

  return (
    <Popover defaultOpen={defaultOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn('h-8 gap-2 px-2.5', selected ? 'border-foreground' : null, className)}
            aria-label={label}
            aria-pressed={selected}
          >
            <span
              aria-hidden="true"
              className="border-border/70 size-4 rounded-[4px] border"
              style={{ backgroundColor: currentColor }}
            />
            {triggerLabel ? <span className="text-xs">{triggerLabel}</span> : null}
            {shouldShowTriggerHex ? (
              <span className="font-mono text-xs uppercase">{currentColor}</span>
            ) : null}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-64 p-3">
        <div className="space-y-3">
          <HexColorPicker
            color={swatchColor}
            onChange={updateColor}
            aria-label={translate(
              'auto.components.ui.color.picker.1cec618bcc',
              '{{value0}} picker',
              { value0: label }
            )}
            className="[&_.react-colorful__pointer]:border-popover"
            style={{ width: '100%', height: 180 }}
          />
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={inputId}>
              {translate('auto.components.ui.color.picker.faa855a582', 'Hex')}
            </Label>
            <span className="text-muted-foreground font-mono text-xs uppercase">{swatchColor}</span>
          </div>
          <Input
            id={inputId}
            value={draft}
            onFocus={() =>
              setDraftState({
                syncedColor: currentColor,
                draft,
                isEditing: true
              })
            }
            onChange={(event) => updateDraft(event.target.value)}
            onBlur={() => {
              if (draftColor) {
                setDraftState({ syncedColor: currentColor, draft: draftColor, isEditing: false })
                onChange(draftColor)
              } else {
                setDraftState({ syncedColor: currentColor, draft: currentColor, isEditing: false })
              }
            }}
            placeholder={currentColor}
            aria-invalid={hasInvalidDraft}
            className="font-mono text-xs uppercase"
          />
          {hasInvalidDraft ? (
            <p className="text-destructive text-xs">
              {translate('auto.components.ui.color.picker.ebcf6ba29e', 'Invalid hex color.')}
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
