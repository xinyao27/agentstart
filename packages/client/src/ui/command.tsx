'use client'

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Command as CommandPrimitive } from 'cmdk'
import * as React from 'react'
import { cn } from '~renderer/ui/class-names'
import {
  modalBackdropClass,
  modalBackdropMotionClass,
  modalSurfaceClass,
  modalSurfaceMotionClass
} from '~renderer/ui/floating-surface-styles'

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground',
        className
      )}
      {...props}
    />
  )
}

function CommandDialog({
  children,
  title = 'Command Palette',
  description = 'Search for a command to run...',
  shouldFilter,
  initialFocus,
  onOpenAutoFocus,
  onCloseAutoFocus,
  contentClassName,
  overlayClassName,
  density = 'default',
  commandProps,
  ...props
}: Omit<DialogPrimitive.Root.Props, 'children'> & {
  // Why: Base UI's Dialog.Root types children as a payload render function too;
  // this wrapper only ever renders the command palette, so narrow it to ReactNode.
  children?: React.ReactNode
  title?: string
  description?: string
  shouldFilter?: boolean
  initialFocus?: DialogPrimitive.Popup.Props['initialFocus']
  onOpenAutoFocus?: (e: Event) => void
  onCloseAutoFocus?: (e: Event) => void
  contentClassName?: string
  overlayClassName?: string
  density?: 'default' | 'compact'
  commandProps?: React.ComponentProps<typeof CommandPrimitive>
}) {
  const { className: commandClassName, ...commandRootProps } = commandProps ?? {}

  // Why: Base UI has no onOpen/onCloseAutoFocus events; it controls focus via
  // Popup initialFocus/finalFocus. Bridge the Radix `event.preventDefault()`
  // idiom to Base's "return false to suppress focus" so existing call sites
  // keep working: run the callback with a cancelable event, and if it prevents
  // default, suppress the focus move.
  const resolvedInitialFocus =
    initialFocus ??
    (onOpenAutoFocus
      ? (): boolean | undefined => {
          const event = new Event('focus', { cancelable: true })
          onOpenAutoFocus(event)
          return event.defaultPrevented ? false : undefined
        }
      : undefined)
  const finalFocus = onCloseAutoFocus
    ? (): boolean | undefined => {
        const event = new Event('focus', { cancelable: true })
        onCloseAutoFocus(event)
        return event.defaultPrevented ? false : undefined
      }
    : undefined

  return (
    <DialogPrimitive.Root {...props}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          data-slot="command-dialog-overlay"
          className={cn(
            modalBackdropClass,
            modalBackdropMotionClass,
            'fixed inset-0 z-50',
            overlayClassName
          )}
        />
        <DialogPrimitive.Popup
          data-slot="command-dialog-content"
          className={cn(
            modalSurfaceClass,
            modalSurfaceMotionClass,
            'fixed top-[20%] left-[50%] z-50 w-[660px] max-w-[90vw] translate-x-[-50%] border outline-none',
            contentClassName
          )}
          initialFocus={resolvedInitialFocus}
          finalFocus={finalFocus}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {description}
          </DialogPrimitive.Description>
          <Command
            shouldFilter={shouldFilter}
            className={cn(
              '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-item]]:px-2',
              density === 'default' ? '[&_[cmdk-item]]:py-3' : '[&_[cmdk-item]]:py-2',
              commandClassName
            )}
            {...commandRootProps}
          >
            {children}
          </Command>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function CommandInput({
  className,
  ref,
  wrapperClassName,
  iconClassName,
  size = 'default',
  variant = 'default',
  ...props
}: Omit<React.ComponentProps<typeof CommandPrimitive.Input>, 'size'> & {
  wrapperClassName?: string
  iconClassName?: string
  size?: 'default' | 'sm'
  variant?: 'default' | 'inset'
}) {
  return (
    <div
      className={cn(
        'flex items-center',
        variant === 'default'
          ? 'border-b border-border bg-muted/30'
          : 'border border-input bg-transparent focus-within:border-ring dark:bg-input/30',
        size === 'default' ? 'px-3 py-1' : 'px-2.5',
        wrapperClassName
      )}
      data-cmdk-input-wrapper=""
    >
      <HugeiconsIcon
        icon={Search01Icon}
        className={cn(
          'mr-2 shrink-0 text-muted-foreground opacity-50',
          size === 'default' ? 'size-4' : 'size-3.5',
          iconClassName
        )}
      />
      <CommandPrimitive.Input
        ref={ref}
        data-slot="command-input"
        className={cn(
          'w-full bg-transparent py-0 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          size === 'default' ? 'h-10' : 'h-8',
          className
        )}
        {...props}
      />
    </div>
  )
}

function CommandList({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  const internalRef = React.useRef<HTMLDivElement>(null)

  // Why: the dialog's scroll-lock calls preventDefault() on wheel events for
  // portaled elements (e.g. Popover) outside the Dialog's DOM tree. The
  // scrollbar renders (CSS overflow works) but the browser never
  // scrolls because the native event is cancelled. A non-passive wheel listener
  // directly on the list takes over scrolling manually so it works regardless
  // of whether a scroll-lock is active.
  React.useEffect(() => {
    const el = internalRef.current
    if (!el) {
      return
    }
    const onWheel = (e: WheelEvent): void => {
      if (el.scrollHeight <= el.clientHeight) {
        return
      }
      e.preventDefault()
      el.scrollTop += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const mergedRef = (node: HTMLDivElement | null) => {
    internalRef.current = node
    if (typeof ref === 'function') {
      ref(node)
    } else if (ref) {
      ref.current = node
    }
  }

  return (
    <CommandPrimitive.List
      ref={mergedRef}
      data-slot="command-list"
      className={cn(
        'max-h-[min(400px,60vh)] overflow-y-auto overflow-x-hidden scrollbar-sleek scroll-pb-4 scroll-pt-4',
        className
      )}
      {...props}
    />
  )
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn('py-6 text-center text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        'overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        'relative flex cursor-default gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
        className
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
}
