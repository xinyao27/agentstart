// Why: tab hit areas retain stable widths while the selected silhouette extends
// into its neighbors without changing layout or drag insertion positions.
// The width hugs the tab's own content — the reference chrome's labels sit close
// together, and a fixed floor wider than the label leaves the trailing slack
// that reads as an oversized gap between neighbors. The 56px floor keeps the
// leading glyph, the close hit area, and a truncating title usable once a full
// strip starts shrinking tabs, and the 240px cap is where long titles ellipsize.
export const TAB_CONTAINER_WIDTH_CLASSES =
  'grid min-w-14 max-w-[240px] flex-[0_1_auto] grid-cols-[minmax(0,1fr)] items-center'
