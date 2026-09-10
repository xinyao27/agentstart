import { cva, type VariantProps } from 'class-variance-authority'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/ui/class-names'

// Why: tooltips invert the app surface, so the shortcut component owns the
// matching palette instead of making each tooltip style its internal parts.
const shortcutKeyCapVariants = cva(
  'inline-flex min-w-6 items-center justify-center rounded-sm border px-1.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'border-border/80 bg-secondary/70 text-muted-foreground',
        inverted: 'border-background/20 bg-background/10 text-background'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

const shortcutKeySeparatorVariants = cva('mx-0.5 text-xs', {
  variants: {
    variant: {
      default: 'text-muted-foreground',
      inverted: 'text-background/70'
    }
  },
  defaultVariants: {
    variant: 'default'
  }
})

function KeyCap({
  label,
  className,
  variant
}: {
  label: string
  className?: string
} & VariantProps<typeof shortcutKeyCapVariants>): React.JSX.Element {
  return <span className={cn(shortcutKeyCapVariants({ variant }), className)}>{label}</span>
}

type ShortcutKeyComboProps = {
  keys: string[]
  className?: string
  separatorClassName?: string
  // Override cap colors when chips sit on a non-default surface (e.g. a filled primary card).
  keyCapClassName?: string
  // When true the chips render a double-tap gesture: no "+" separator (reads
  // "Shift Shift"), with a title clarifying the gesture. Note: the title uses
  // the displayed label, so on Mac it reads as the glyph (e.g. 'Double-tap ⇧').
  doubleTap?: boolean
} & VariantProps<typeof shortcutKeyCapVariants>

export function ShortcutKeyCombo({
  keys,
  className,
  separatorClassName,
  keyCapClassName,
  variant = 'default',
  doubleTap = false
}: ShortcutKeyComboProps): React.JSX.Element {
  const isMac = navigator.userAgent.includes('Mac')

  return (
    <span
      className={cn('inline-flex items-center gap-1', className)}
      title={
        doubleTap && keys.length > 0
          ? translate('auto.components.ShortcutKeyCombo.07eb4985a1', 'Double-tap {{value0}}', {
              value0: keys[0]
            })
          : undefined
      }
    >
      {keys.map((key, index) => (
        <React.Fragment key={`${key}-${index}`}>
          <KeyCap label={key} className={keyCapClassName} variant={variant} />
          {/* Why: AgentStart renders Mac shortcuts as adjacent glyphs, but Windows/Linux
              shortcuts read more naturally with explicit "+" separators. A
              double-tap reads as the same key twice, so it gets a space, not "+". */}
          {!isMac && !doubleTap && index < keys.length - 1 ? (
            <span className={cn(shortcutKeySeparatorVariants({ variant }), separatorClassName)}>
              +
            </span>
          ) : null}
        </React.Fragment>
      ))}
    </span>
  )
}
