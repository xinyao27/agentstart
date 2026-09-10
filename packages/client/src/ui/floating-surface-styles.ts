// Why: every portaled surface needs one opaque, bordered recipe; outline-none
// prevents focused Base UI popups from adding a second browser-native stroke.
export const floatingSurfaceClass =
  'rounded-lg border border-border outline-none !bg-popover text-popover-foreground !backdrop-blur-none'

export const modalSurfaceClass =
  'rounded-lg border-border bg-background text-foreground !backdrop-blur-none'

export const modalBackdropClass = 'bg-black/50'

export const floatingSurfaceMotionClass =
  'origin-(--transform-origin) transition-[opacity,transform,scale] data-starting-style:opacity-0 data-starting-style:scale-95 data-ending-style:opacity-0 data-ending-style:scale-95 data-[side=bottom]:data-starting-style:-translate-y-2 data-[side=top]:data-starting-style:translate-y-2 data-[side=left]:data-starting-style:translate-x-2 data-[side=right]:data-starting-style:-translate-x-2'

// Why: pointer-anchored surfaces must not animate geometry after the pointer
// establishes their position; an opacity-only transition keeps the anchor stable.
export const pointerAnchoredSurfaceMotionClass =
  'transition-opacity data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none'

export const modalSurfaceMotionClass =
  'transition-[opacity,transform] data-starting-style:opacity-0 data-starting-style:scale-95 data-ending-style:opacity-0 data-ending-style:scale-95'

export const modalBackdropMotionClass =
  'transition-opacity data-starting-style:opacity-0 data-ending-style:opacity-0'
