import type { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu'

function shouldIgnoreTerminalMenuPointerDownOutside(args: {
  openedAtMs: number
  nowMs: number
}): boolean {
  const { openedAtMs, nowMs } = args
  // Why: only the opening gesture should be ignored. After that brief window,
  // outside clicks including right-click and macOS control-click must dismiss
  // normally so the terminal menu behaves like the app's other context menus.
  return nowMs - openedAtMs < 100
}

/** Root `onOpenChange` for the terminal pane menu: keeps it alive through the
 *  opening gesture and through xterm reclaiming focus. */
export function createTerminalMenuOpenChangeHandler(args: {
  menuOpenedAtRef: { readonly current: number }
  setOpen: (open: boolean) => void
}): (open: boolean, eventDetails: ContextMenuPrimitive.Root.ChangeEventDetails) => void {
  const { menuOpenedAtRef, setOpen } = args
  return (nextOpen, eventDetails) => {
    if (!nextOpen) {
      // Why: xterm reclaims focus after the contextmenu event; don't let
      // Base UI treat that as a dismiss signal.
      if (eventDetails.reason === 'focus-out') {
        eventDetails.cancel()
        return
      }
      // Why: the contextmenu pointerdown can immediately reach the menu as
      // an outside press right after it opens.
      if (
        eventDetails.reason === 'outside-press' &&
        shouldIgnoreTerminalMenuPointerDownOutside({
          openedAtMs: menuOpenedAtRef.current,
          nowMs: Date.now()
        })
      ) {
        eventDetails.cancel()
        return
      }
      if (Date.now() - menuOpenedAtRef.current < 100) {
        return
      }
    }
    setOpen(nextOpen)
  }
}
