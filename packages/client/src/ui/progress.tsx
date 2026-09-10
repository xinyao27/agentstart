import { Progress as ProgressPrimitive } from '@base-ui/react/progress'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '~renderer/ui/class-names'

const progressVariants = cva('relative overflow-hidden rounded-full', {
  variants: {
    variant: {
      default: 'bg-primary/20',
      muted: 'bg-muted'
    },
    size: {
      default: 'h-2 w-full',
      xs: 'h-[5px] w-7'
    }
  },
  defaultVariants: {
    variant: 'default',
    size: 'default'
  }
})

const progressIndicatorVariants = cva('h-full w-full flex-1 transition-all duration-300 ease-out', {
  variants: {
    tone: {
      default: 'bg-primary',
      neutral: 'bg-muted-foreground/40',
      warning: 'bg-amber-500',
      critical: 'bg-red-500'
    }
  },
  defaultVariants: {
    tone: 'default'
  }
})

function Progress({
  className,
  value,
  variant,
  size,
  tone,
  ...props
}: ProgressPrimitive.Root.Props &
  VariantProps<typeof progressVariants> &
  VariantProps<typeof progressIndicatorVariants>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn(progressVariants({ variant, size }), className)}
      {...props}
    >
      {/* Base UI computes the Indicator fill width, so the manual translateX is gone. */}
      <ProgressPrimitive.Track data-slot="progress-track" className="size-full">
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className={progressIndicatorVariants({ tone })}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  )
}

export { Progress }
