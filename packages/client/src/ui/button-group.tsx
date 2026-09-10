import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '~renderer/ui/class-names'
const buttonGroupVariants = cva(
  "flex w-fit items-stretch has-[>[data-slot=button-group]]:gap-2 [&>*]:focus-visible:relative [&>*]:focus-visible:z-10 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-md [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
  {
    variants: {
      orientation: {
        // Why: disabled tooltip triggers wrap buttons in spans; nested rules preserve grouped seams.
        horizontal:
          '[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none [&>[data-slot=tooltip-trigger]:not(:first-child)>button]:rounded-l-none [&>[data-slot=tooltip-trigger]:not(:first-child)>button]:border-l-0 [&>[data-slot=tooltip-trigger]:not(:last-child)>button]:rounded-r-none',
        vertical:
          'flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none'
      },
      presentation: {
        default: '',
        titlebar: 'h-full'
      }
    },
    defaultVariants: {
      orientation: 'horizontal',
      presentation: 'default'
    }
  }
)

function ButtonGroup({
  className,
  orientation,
  presentation,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof buttonGroupVariants>) {
  return (
    <div
      role="group"
      data-slot="button-group"
      data-orientation={orientation}
      className={cn(buttonGroupVariants({ orientation, presentation }), className)}
      {...props}
    />
  )
}

export { ButtonGroup }
