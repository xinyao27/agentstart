import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '~renderer/ui/class-names'

const textareaVariants = cva(
  'scrollbar-sleek w-full min-w-0 resize-y rounded-md border border-input bg-transparent outline-none transition-[color] placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 focus-visible:border-ring aria-invalid:border-destructive',
  {
    variants: {
      size: {
        default: 'min-h-20 px-3 py-2 text-base md:text-sm',
        sm: 'min-h-16 px-2 py-1.5 text-xs'
      },
      variant: {
        default: '',
        'chrome-free':
          'min-h-0 resize-none border-0 bg-transparent px-0 py-0 focus-visible:border-transparent dark:bg-transparent',
        editor:
          'scrollbar-editor min-h-0 resize-none border-0 bg-[var(--editor-surface)] p-3 font-mono text-xs leading-5 text-foreground dark:bg-[var(--editor-surface)]'
      }
    },
    defaultVariants: {
      size: 'default',
      variant: 'default'
    }
  }
)

type TextareaProps = React.ComponentPropsWithRef<'textarea'> & VariantProps<typeof textareaVariants>

function Textarea({ className, ref, size, variant, ...props }: TextareaProps): React.JSX.Element {
  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(textareaVariants({ size, variant }), className)}
      {...props}
    />
  )
}

export { Textarea }
