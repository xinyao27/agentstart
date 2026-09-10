import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '~renderer/ui/class-names'

const inputVariants = cva(
  'w-full min-w-0 appearance-none rounded-md border border-input bg-transparent transition-[color] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:border-0 file:bg-transparent file:font-medium file:text-foreground placeholder:text-muted-foreground/60 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 focus-visible:border-ring aria-invalid:border-destructive',
  {
    variants: {
      size: {
        default: 'h-9 px-3 py-1 text-base file:h-7 file:text-sm md:text-sm',
        // Why: prominent form rows align with the existing 40px large action size.
        lg: 'h-10 px-4 py-2 text-sm file:h-8 file:text-sm',
        sm: 'h-8 px-2 py-1 text-sm file:h-6 file:text-xs',
        xs: 'h-7 px-2 py-1 text-xs file:h-5 file:text-xs',
        // Why: inline rename fields must fit compact title and tree rows without local sizing recipes.
        'inline-edit': 'h-5 px-1 py-0 text-xs file:h-4 file:text-xs'
      },
      variant: {
        default: '',
        // Why: Chromium color inputs need their native swatch affordance inside the shared field border.
        color: 'appearance-auto bg-transparent p-1 dark:bg-transparent',
        subtle: 'bg-input/40 dark:bg-input/40',
        'chrome-free':
          'h-auto border-0 bg-transparent px-0 py-0 focus-visible:border-transparent dark:bg-transparent'
      }
    },
    defaultVariants: {
      size: 'default',
      variant: 'default'
    }
  }
)

type InputProps = Omit<React.ComponentPropsWithRef<'input'>, 'size'> &
  VariantProps<typeof inputVariants>

function Input({ className, ref, type, size, variant, ...props }: InputProps): React.JSX.Element {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(inputVariants({ size, variant }), className)}
      {...props}
    />
  )
}

export { Input }
