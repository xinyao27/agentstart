import type { JSX } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Check } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

export function DeleteWorktreeSkipConfirmOption({
  showDontAskAgain,
  dontAskAgain,
  onToggleDontAskAgain
}: {
  showDontAskAgain: boolean
  dontAskAgain: boolean
  onToggleDontAskAgain: () => void
}): JSX.Element | null {
  if (!showDontAskAgain) {
    return null
  }

  return (
    <Button
      variant="ghost"
      size="xs"
      type="button"
      role="checkbox"
      aria-checked={dontAskAgain}
      onClick={onToggleDontAskAgain}
      className="text-foreground/80 hover:text-foreground flex h-auto gap-2 border-0 px-1 py-1 transition-colors"
    >
      <span
        className={cn(
          'flex size-4 items-center justify-center rounded-sm border transition-colors',
          dontAskAgain
            ? 'border-foreground bg-foreground text-background'
            : 'border-muted-foreground bg-transparent'
        )}
      >
        {dontAskAgain ? <Check className="size-3" /> : null}
      </span>
      {translate(
        'auto.components.sidebar.DeleteWorktreeSkipConfirmOption.29aefb7e52',
        "Don't ask again"
      )}
    </Button>
  )
}
