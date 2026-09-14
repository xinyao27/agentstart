import { createContext, useContext } from 'react'
import type React from 'react'

/**
 * The surface a strip row paints on.
 *
 * The shell header is the chrome plane's own top row — it shows the plane
 * behind the tabs, so a selected tab there merges across the row's baseline
 * into the content card. A pane-local strip inside the workbench sits on that
 * same card and has no plane to flare into, so it keeps the recessed control
 * surface instead. The scope rides on the strip: a workspace strip that the
 * shell prefers to portal sets `plane` where it portals, and pane-local rows
 * take the default.
 */
export type TabSurfaceScope = 'plane' | 'card'

const TabSurfaceScopeContext = createContext<TabSurfaceScope>('card')

export function TabSurfaceProvider({
  scope,
  children
}: {
  scope: TabSurfaceScope
  children: React.ReactNode
}): React.JSX.Element {
  return <TabSurfaceScopeContext.Provider value={scope}>{children}</TabSurfaceScopeContext.Provider>
}

export function TabHoverSurface(): React.JSX.Element {
  return (
    // Why: the hover wash is inset from the tab hit area so it cannot touch
    // the selected tab's surface or visually merge two neighboring tabs.
    <span
      aria-hidden
      className="group-hover:bg-muted group-focus-within:bg-muted pointer-events-none absolute inset-x-1.5 inset-y-1 -z-10 rounded-lg bg-transparent transition-colors duration-150 motion-reduce:transition-none"
    />
  )
}

export function TabActiveSurface(): React.JSX.Element {
  return useContext(TabSurfaceScopeContext) === 'plane' ? (
    <TabContentMerge />
  ) : (
    <TabRecessedSurface />
  )
}

/**
 * The selected tab on the chrome plane: its body ends on the strip's baseline,
 * where the content card's own top edge starts, and two inverse quarter arcs
 * flare it outward into the plane — so the tab and the card read as one
 * surface, the way a browser's active tab fuses with the page below the tab
 * strip.
 *
 * Why the geometry is constrained this way: the strip is a horizontal scroll
 * container (`overflow-y: hidden` inside `overflow-hidden` wrappers), so the
 * whole silhouette is drawn inside the row and stops exactly on the baseline —
 * anything painted past it would be clipped and the tab would look detached.
 * Both arcs are 12px wide because the strip reserves a matching 12px shoulder
 * gutter on each side of its content, which is what keeps the first and last
 * shoulders inside the clipping viewport.
 *
 * Why the body spans the tab's full width: in the reference chrome the tab's
 * fill is its hit box, so the fill's edge is the tab's padding boundary — 12px
 * out to the glyphs, and 24px between two neighbors' glyphs. The hover wash
 * stays inset, which is what keeps it clear of this surface.
 *
 * Why the shadow is a separate masked layer: the card starts flush under the
 * row, so any paint below the baseline would darken the card's first pixels
 * beneath the tab and read as a gap. The layer carries the top-and-sides
 * contour the reference tab lifts with, and the mask fades it out across the
 * shoulder band, so the join itself keeps a zero shadow budget.
 *
 * Why the mask sits on a widened, full-height wrapper: a mask only paints
 * inside its own box, and its tile repeats — masking the shadow's own box would
 * erase the side shadows that fall outside the tab and repeat the transparent
 * bottom band over the tab's top edge. The wrapper therefore spans the whole
 * row plus the shoulder width, and the shadow layer inside it re-establishes
 * the tab's own box, so the contour hugs the tab while the fade stays at the
 * join.
 */
function TabContentMerge(): React.JSX.Element {
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-x-3 inset-y-0 -z-20 [mask-image:linear-gradient(to_top,transparent_0px,black_12px)]"
      >
        <span className="absolute inset-x-3 top-1 bottom-0 block rounded-t-lg shadow-[0_-1px_3px_color-mix(in_srgb,black_10%,transparent)]" />
      </span>
      <span
        aria-hidden
        className="bg-background pointer-events-none absolute inset-x-0 top-1 bottom-0 -z-10 rounded-t-lg"
      />
      {/* Why: the arc is the disc's complement — the fill is the crescent left
          between the 12px circle and the shoulder's outer corner, which makes
          the curve concave and tangent to the tab's side and the card's top
          edge. */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 -left-3 -z-10 size-3 bg-[radial-gradient(circle_12px_at_top_left,transparent_11.5px,var(--background)_12px)]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-3 bottom-0 -z-10 size-3 bg-[radial-gradient(circle_12px_at_top_right,transparent_11.5px,var(--background)_12px)]"
      />
    </>
  )
}

/**
 * The selected tab on the content card itself — a pane-local strip in a split
 * — where the merge silhouette would be white on white. It keeps the recessed
 * treatment the sibling islands on that surface already use.
 */
function TabRecessedSurface(): React.JSX.Element {
  return (
    <span
      aria-hidden
      className="border-border bg-card pointer-events-none absolute inset-x-1.5 inset-y-1 -z-10 rounded-lg border shadow-[0_1px_2px_color-mix(in_srgb,black_6%,transparent)]"
    />
  )
}
