import {
  formatKeybinding,
  isDoubleTapBinding,
  type KeybindingActionId,
  type KeybindingInput
} from '@yiru/protocol/keybindings'
import React, { useEffect, useRef, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  ModifierDoubleTapDetector,
  modifierFromKeyEvent,
  toModifierDoubleTapEvent
} from '~renderer/modifier-double-tap-detector'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { ShortcutKeyCombo } from '~renderer/ui/shortcut-key-combo'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

type ShortcutRecorderButtonProps = {
  actionId: KeybindingActionId
  title: string
  platform: NodeJS.Platform
  isDigitIndex: boolean
  // The chord this button edits, or null for the transient "add a new binding" slot.
  binding: string | null
  bindingIndex: number
  bindingCount: number
  recording: boolean
  isAppendSlot?: boolean
  onStartRecording: (actionId: KeybindingActionId, index: number) => void
  onCancelRecording: () => void
  onCapture: (actionId: KeybindingActionId, input: KeybindingInput) => void
  onClearError: (actionId: KeybindingActionId) => void
}

// Why: digit-index rows store one representative chord (e.g. ⌘1) but fire for
// 1-9, so the trailing number cap renders the whole range.
function toDigitRangeKeys(keys: string[]): string[] {
  const last = keys.at(-1)
  if (last === undefined || !/^[1-9]$/.test(last)) {
    return keys
  }
  return [...keys.slice(0, -1), `${last}–9`]
}

export function ShortcutRecorderButton({
  actionId,
  title,
  platform,
  isDigitIndex,
  binding,
  bindingIndex,
  bindingCount,
  recording,
  isAppendSlot = false,
  onStartRecording,
  onCancelRecording,
  onCapture,
  onClearError
}: ShortcutRecorderButtonProps): React.JSX.Element {
  const recordButtonRef = useRef<HTMLButtonElement | null>(null)
  const [doubleTapDetector] = useState(() => new ModifierDoubleTapDetector())

  useEffect(() => {
    if (recording) {
      recordButtonRef.current?.focus()
    } else {
      // Stale taps mustn't survive into the next recording session.
      doubleTapDetector.reset()
    }
    // The global recorder-focused flag is owned by ShortcutsPane (one source of
    // truth across rows), so it isn't toggled here.
  }, [doubleTapDetector, recording])

  const handleRecordKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (!recording) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onStartRecording(actionId, bindingIndex)
      }
      return
    }

    event.preventDefault()
    event.stopPropagation()

    if (event.key === 'Escape') {
      doubleTapDetector.reset()
      onClearError(actionId)
      onCancelRecording()
      return
    }

    // A modifier press never captures on its own — the detector decides whether
    // it completes a double-tap, leaving normal chords to capture on their key.
    if (modifierFromKeyEvent(event.code, event.key) !== null) {
      const detected = doubleTapDetector.process(
        toModifierDoubleTapEvent({
          type: 'keyDown',
          code: event.code,
          key: event.key,
          shift: event.shiftKey,
          control: event.ctrlKey,
          alt: event.altKey,
          meta: event.metaKey,
          isAutoRepeat: event.repeat
        }),
        Date.now()
      )
      if (detected) {
        onClearError(actionId)
        onCapture(actionId, { doubleTapModifier: detected.modifier })
        doubleTapDetector.reset()
      }
      return
    }

    doubleTapDetector.reset()
    onClearError(actionId)
    onCapture(actionId, {
      key: event.key,
      code: event.code,
      alt: event.altKey,
      meta: event.metaKey,
      control: event.ctrlKey,
      shift: event.shiftKey
    })
  }

  const handleRecordKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (!recording) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    doubleTapDetector.process(
      toModifierDoubleTapEvent({
        type: 'keyUp',
        code: event.code,
        key: event.key,
        shift: event.shiftKey,
        control: event.ctrlKey,
        alt: event.altKey,
        meta: event.metaKey
      }),
      Date.now()
    )
  }

  const recorderLabel = recording
    ? translate(
        'auto.components.settings.ShortcutRecorderButton.1a13bb054d',
        'Press shortcut keys for {{value0}}. Escape cancels.',
        { value0: title }
      )
    : isAppendSlot || binding === null
      ? translate(
          'auto.components.settings.ShortcutRecorderButton.3732775d74',
          'Add shortcut for {{value0}}',
          { value0: title }
        )
      : bindingCount <= 1
        ? translate(
            'auto.components.settings.ShortcutRecorderButton.88764af2c1',
            'Change shortcut for {{value0}}',
            { value0: title }
          )
        : translate(
            'auto.components.settings.ShortcutRecorderButton.30feb099d6',
            'Change shortcut {{value0}} of {{value1}} for {{value2}}',
            { value0: String(bindingIndex + 1), value1: String(bindingCount), value2: title }
          )

  const tooltipLabel = recording
    ? translate(
        'auto.components.settings.ShortcutRecorderButton.5d982a2a1f',
        'Listening for shortcut'
      )
    : isAppendSlot || binding === null
      ? translate('auto.components.settings.ShortcutRecorderButton.152e0bcd64', 'Add shortcut')
      : translate('auto.components.settings.ShortcutRecorderButton.5bd56445da', 'Change shortcut')

  const keys = binding === null ? [] : formatKeybinding(binding, platform)

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="xs"
            ref={recordButtonRef}
            type="button"
            aria-label={recorderLabel}
            aria-pressed={recording}
            data-shortcut-recorder=""
            data-shortcut-recorder-active={recording ? '' : undefined}
            onClick={() => {
              if (!recording) {
                onStartRecording(actionId, bindingIndex)
              }
            }}
            onKeyDown={handleRecordKeyDown}
            onKeyUp={handleRecordKeyUp}
            className={cn(
              'h-auto flex min-h-7 min-w-[5.5rem] max-w-[14rem] justify-end gap-1.5 overflow-hidden border py-1 transition-colors',
              recording
                ? 'border-ring bg-accent text-accent-foreground'
                : 'hover:border-border/70 hover:bg-background'
            )}
          >
            {recording || binding === null ? (
              <span className="text-muted-foreground px-1">
                {translate(
                  'auto.components.settings.ShortcutRecorderButton.f5ed5dcbf6',
                  'Press keys…'
                )}
              </span>
            ) : (
              <span className="flex flex-wrap items-center justify-end gap-1.5 overflow-hidden">
                <ShortcutKeyCombo
                  keys={isDigitIndex ? toDigitRangeKeys(keys) : keys}
                  doubleTap={isDoubleTapBinding(binding)}
                />
              </span>
            )}
          </Button>
        }
      />
      <TooltipContent side="top" sideOffset={4}>
        {tooltipLabel}
      </TooltipContent>
    </Tooltip>
  )
}
