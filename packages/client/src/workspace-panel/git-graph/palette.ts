import { GIT_HISTORY_LANE_COLORS, GIT_HISTORY_REF_COLOR } from '@yiru/protocol/git/history-types'

// Why: lanes paint from the design system's own graph tokens rather than
// vscode-git-graph's 12 upstream hexes, which were tuned for that extension's
// dark webview and read as neon against our surfaces. These are the same ids
// the ref badges resolve, so a branch's pill and its lane match, and `var()`
// lets the light/dark values in main.css switch without a JS theme lookup.
// Lane 0 is the ref colour: it is the trunk the checked-out branch sits on.
export const GIT_GRAPH_COLORS: readonly string[] = [
  GIT_HISTORY_REF_COLOR,
  ...GIT_HISTORY_LANE_COLORS
].map((colorId) => `var(--${colorId})`)
