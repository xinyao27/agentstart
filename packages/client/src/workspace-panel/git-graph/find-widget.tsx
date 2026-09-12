import type React from 'react'
import { useEffect, useRef } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { CaretDown, CaretUp, X } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { Input } from '~renderer/ui/input'

export function GitGraphFindWidget({
  query,
  onQueryChange,
  matchCount,
  currentIndex,
  onPrev,
  onNext,
  onClose
}: {
  query: string
  onQueryChange: (value: string) => void
  matchCount: number
  currentIndex: number
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const positionLabel =
    matchCount === 0
      ? translate('auto.components.workspace-panel.git-graph.FindWidget.a1b2c3d4e5', 'No results')
      : translate(
          'auto.components.workspace-panel.git-graph.FindWidget.b2c3d4e5f6',
          '{{value0}} of {{value1}}',
          { value0: String(currentIndex + 1), value1: String(matchCount) }
        )

  return (
    <div className="border-border bg-popover absolute top-2 right-3 z-10 flex h-8 items-center gap-1 rounded-md border px-1.5 shadow-sm">
      <Input
        ref={inputRef}
        variant="chrome-free"
        size="xs"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          } else if (event.key === 'Enter') {
            event.preventDefault()
            if (event.shiftKey) {
              onPrev()
            } else {
              onNext()
            }
          }
        }}
        placeholder={translate(
          'auto.components.workspace-panel.git-graph.FindWidget.c3d4e5f6a7',
          'Find by subject, author, or hash…'
        )}
        className="w-56"
      />
      <span className="text-muted-foreground min-w-[4.5rem] shrink-0 text-center text-[11px] tabular-nums">
        {positionLabel}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={matchCount === 0}
        onClick={onPrev}
        aria-label={translate(
          'auto.components.workspace-panel.git-graph.FindWidget.d4e5f6a7b8',
          'Previous match'
        )}
      >
        <CaretUp className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={matchCount === 0}
        onClick={onNext}
        aria-label={translate(
          'auto.components.workspace-panel.git-graph.FindWidget.e5f6a7b8c9',
          'Next match'
        )}
      >
        <CaretDown className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onClose}
        aria-label={translate(
          'auto.components.workspace-panel.git-graph.FindWidget.f6a7b8c9d0',
          'Close find'
        )}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  )
}
