import { Switch as SwitchPrimitive } from '@base-ui/react/switch'
import * as React from 'react'
import { cn } from '~renderer/ui/class-names'

type SwitchProps = Omit<SwitchPrimitive.Root.Props, 'nativeButton' | 'render'> & {
  ref?: React.Ref<HTMLElement>
}

function Switch({ className, ref, ...props }: SwitchProps): React.JSX.Element {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      nativeButton
      render={<button type="button" />}
      data-slot="switch"
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent outline-none transition-colors focus-visible:border-ring data-checked:bg-primary data-unchecked:bg-input data-disabled:cursor-not-allowed data-disabled:opacity-50 dark:data-unchecked:bg-input/80',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="bg-background dark:data-checked:bg-primary-foreground pointer-events-none block size-4 translate-x-0 rounded-full transition-transform data-checked:translate-x-4.5"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
