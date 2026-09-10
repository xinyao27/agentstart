'use client'

import { Select as SelectPrimitive } from '@base-ui/react/select'
import { ArrowDown01Icon, ArrowUp01Icon, CheckIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '~renderer/ui/class-names'
import {
  floatingSurfaceClass,
  floatingSurfaceMotionClass
} from '~renderer/ui/floating-surface-styles'

// Bare re-export: SelectPrimitive.Root.Props is generic <Value, Multiple>, which
// a wrapper function / ComponentProps cannot express without erasing the generic.
const Select = SelectPrimitive.Root

function SelectValue({ ...props }: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  size = 'default',
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: 'xs' | 'sm' | 'default'
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap transition-[color] outline-none focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-[placeholder]:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 data-[size=xs]:h-7 data-[size=xs]:gap-1.5 data-[size=xs]:px-2 data-[size=xs]:text-xs *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[size=xs]:[&_svg:not([class*='size-'])]:size-3 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className={cn('opacity-50', size === 'xs' ? 'size-3' : 'size-4')}
          />
        }
      />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  align = 'center',
  sideOffset = 4,
  alignItemWithTrigger = true,
  portalContainer,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<SelectPrimitive.Positioner.Props, 'align' | 'sideOffset' | 'alignItemWithTrigger'> & {
    portalContainer?: HTMLElement | null
  }) {
  return (
    <SelectPrimitive.Portal container={portalContainer ?? undefined}>
      {/* Positioner carries anchoring; alignItemWithTrigger replaces radix position="item-aligned". */}
      <SelectPrimitive.Positioner
        // Why: Base UI positions this wrapper with a transform, which traps the
        // popup's z-index unless the wrapper itself sits above page surfaces.
        className="isolate z-[70]"
        align={align}
        sideOffset={sideOffset}
        alignItemWithTrigger={alignItemWithTrigger}
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            floatingSurfaceClass,
            floatingSurfaceMotionClass,
            'relative isolate z-[70] max-h-(--available-height) min-w-(--anchor-width) overflow-x-hidden overflow-y-auto scrollbar-sleek',
            className
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List className="p-1">{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        data-slot="select-item-indicator"
        render={<span className="absolute right-2 flex size-3.5 items-center justify-center" />}
      >
        <HugeiconsIcon icon={CheckIcon} className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('pointer-events-none -mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({ className, ...props }: SelectPrimitive.ScrollUpArrow.Props) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      // top-0 w-full: Base UI scroll arrows render as absolutely-positioned overlays.
      className={cn('flex cursor-default items-center justify-center py-1 top-0 w-full', className)}
      {...props}
    >
      <HugeiconsIcon icon={ArrowUp01Icon} className="size-4" />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({ className, ...props }: SelectPrimitive.ScrollDownArrow.Props) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      // bottom-0 w-full: Base UI scroll arrows render as absolutely-positioned overlays.
      className={cn(
        'flex cursor-default items-center justify-center py-1 bottom-0 w-full',
        className
      )}
      {...props}
    >
      <HugeiconsIcon icon={ArrowDown01Icon} className="size-4" />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue }
