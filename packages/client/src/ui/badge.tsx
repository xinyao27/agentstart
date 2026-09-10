import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '~renderer/ui/class-names'

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent font-medium whitespace-nowrap transition-[color] outline-none focus-visible:border-ring aria-invalid:border-destructive [&>svg]:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        dot: 'bg-background text-foreground border-border dark:bg-secondary dark:border-border',
        destructive:
          'bg-destructive text-white dark:bg-destructive/60 [a&]:hover:bg-destructive/90',
        outline:
          'border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        ghost: '[a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 [a&]:hover:underline',
        // Why: status chips reuse Tailwind palette tones so call sites do not
        // hand-roll emerald/amber borders for every metadata pill.
        success:
          'border-green-700/25 bg-green-700/10 text-green-700 dark:border-green-300/25 dark:bg-green-300/10 dark:text-green-300',
        warning: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
      },
      size: {
        default: 'px-2 py-0.5 text-xs [&>svg]:size-3',
        xs: 'h-5 gap-1 px-1.5 text-[11px] leading-none [&>svg]:size-2.5'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

function Badge({
  className,
  variant = 'default',
  size = 'default',
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    render,
    props: mergeProps<'span'>(
      // Cast the literal: data-* keys are only special-cased in JSX, so they
      // fail excess-property checks when passed as an object to mergeProps.
      {
        'data-slot': 'badge',
        'data-variant': variant,
        'data-size': size,
        className: cn(badgeVariants({ variant, size }), className)
      } as React.ComponentProps<'span'>,
      props
    )
  })
}

export { Badge }
