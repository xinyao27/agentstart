// Why: inactive tabs belong to the titlebar plane and should reveal their
// shape through typography and an inset hover surface, not root backgrounds;
// scroll margin keeps a selected tab's pill inside the padded viewport.
// The 12px horizontal padding is the reference chrome's own tab padding: it
// puts the fill's edge 12px from the glyphs and two neighbors' glyphs 24px
// apart, and it matches the strip's 12px shoulder gutter, so the first tab's
// outer arc lands exactly on the viewport's padding edge.
export const TAB_ROOT_CLASSES =
  'group relative isolate flex h-full items-center scroll-mx-3 px-3 text-xs cursor-pointer select-none outline-none transition-[color] duration-150 ease-out motion-reduce:transition-none focus:outline-none'

// Why: the reference chrome uses compact 14px identity glyphs with an 8px
// title gap; sharing the rule keeps every tab content type aligned.
export const TAB_LEADING_ICON_CLASSES = 'mr-2 size-3.5 shrink-0'

// Why: tab bodies are the interior of the floating workspace content card,
// so they share the card's canvas across every workspace content type.
export const TAB_CONTENT_SURFACE_CLASSES = 'bg-background text-foreground'

export function getTitlebarTabStateClasses(isActive: boolean): string {
  // Why: the selected tab's merge silhouette paints behind the label, so the
  // root only carries color and stacking — switching tabs cannot move its
  // contents.
  return isActive
    ? 'relative z-10 text-foreground'
    : 'text-muted-foreground hover:text-foreground focus-within:text-foreground'
}
