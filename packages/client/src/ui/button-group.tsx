import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '~renderer/ui/class-names'

const buttonGroupVariants = cva(
  "flex w-fit items-stretch has-[>[data-slot=button-group]]:gap-2 [&>*]:focus-visible:relative [&>*]:focus-visible:z-10 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-md [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
  {
    variants: {
      orientation: {
        // Why: the seam rules live in main.css. They cannot be expressed as a
        // variant string here: a segmented control nests items whose data-slot
        // is stamped over by their TooltipTrigger, and Base UI inserts hidden
        // focus-guard spans into this container, so `:last-child` and
        // `[data-slot=toggle-group-item]` both describe the wrong element.
        horizontal: '',
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
      // Why: the seam CSS keys on the orientation, so it must be present even
      // when the caller relies on the horizontal default.
      data-orientation={orientation ?? 'horizontal'}
      className={cn(buttonGroupVariants({ orientation, presentation }), className)}
      {...props}
    />
  )
}

export { ButtonGroup }
