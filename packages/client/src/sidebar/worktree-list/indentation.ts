const SIDEBAR_TREE_INDENT = 18
// Why: project-grouped cards need to read as children even after the card
// surface inset is subtracted, while lineage rows keep the base tree step.
const PROJECT_WORKTREE_CARD_EXTRA_INDENT = 2
// Why: flush surfaces share the row edge with group headers; matching the
// content pullback to that margin preserves the existing inner anchor.
const WORKTREE_CARD_SURFACE_MARGIN = 0
const FLUSH_CARD_CONTENT_PULLBACK = WORKTREE_CARD_SURFACE_MARGIN
// Why: a trailing workspace status icon should not shift the title away from
// the leading tree anchor that the former status column established.
const STATUS_ICON_TITLE_ANCHOR_PULLBACK_PX = 6
// Why: even at zero indent, flush-card content should not sit against the sidebar edge.
const FLUSH_CARD_MIN_CONTENT_INSET = 2
// Why: pre-refactor level-1 lineage used the grouped card content step; keep
// that anchor while nested levels advance evenly instead of accumulating depth.
const LINEAGE_IMMEDIATE_PARENT_STEP = SIDEBAR_TREE_INDENT + PROJECT_WORKTREE_CARD_EXTRA_INDENT
const LINEAGE_NESTED_ROW_SURFACE_INSET = 0
export const LINEAGE_CHILDREN_INLINE_OFFSET =
  LINEAGE_IMMEDIATE_PARENT_STEP - WORKTREE_CARD_SURFACE_MARGIN - FLUSH_CARD_MIN_CONTENT_INSET
// Why: grouped workspace cards keep a full-bleed surface like project headers;
// the tree step lives in the card's content indent instead of the row inset.
const GROUPED_WORKTREE_CARD_SURFACE_INDENT = 0
const PROJECT_GROUP_HEADER_BASE_PADDING = 10
// Why: workspace/status headers and project headers occupy the same sidebar
// row role, so their titles should not shift when switching grouping modes.
export const WORKTREE_SECTION_HEADER_PADDING_LEFT = PROJECT_GROUP_HEADER_BASE_PADDING
const PROJECT_GROUP_HEADER_INDENT = 10
const MAX_PROJECT_GROUP_HEADER_DEPTH = 6

function clampDepth(depth: number): number {
  return Math.max(0, Math.floor(Number.isFinite(depth) ? depth : 0))
}

export function getProjectGroupHeaderPaddingLeft(depth: number): number {
  return (
    PROJECT_GROUP_HEADER_BASE_PADDING +
    Math.min(clampDepth(depth), MAX_PROJECT_GROUP_HEADER_DEPTH) * PROJECT_GROUP_HEADER_INDENT
  )
}

export function getWorktreeCardContentIndent(args: {
  isGrouped: boolean
  groupDepth: number
  lineageDepth: number
}): number {
  const groupSteps = args.isGrouped ? clampDepth(args.groupDepth) + 1 : 0
  const projectCardIndent = args.isGrouped ? PROJECT_WORKTREE_CARD_EXTRA_INDENT : 0
  return (groupSteps + clampDepth(args.lineageDepth)) * SIDEBAR_TREE_INDENT + projectCardIndent
}

export function getProjectWorktreeCardContentIndent(args: {
  groupDepth: number
  lineageDepth: number
}): number {
  // Why: the direct workspace icon aligns with its Project label, one tree step
  // beyond the generic grouped-row anchor.
  return (
    getWorktreeCardContentIndent({
      isGrouped: true,
      groupDepth: args.groupDepth,
      lineageDepth: args.lineageDepth
    }) + SIDEBAR_TREE_INDENT
  )
}

export function getFolderBackedRepoWorktreeCardContentIndent(args: {
  groupDepth: number
  lineageDepth: number
}): number {
  // Why: folder-scanned groups indent repo headers by the compact header step;
  // worktree rows should follow that rhythm instead of adding a full tree step.
  return (
    getProjectGroupHeaderPaddingLeft(args.groupDepth) +
    PROJECT_GROUP_HEADER_BASE_PADDING +
    (clampDepth(args.lineageDepth) + 1) * SIDEBAR_TREE_INDENT
  )
}

export function getFolderBackedRepoWorktreeCardSurfaceInset(args: {
  groupDepth: number
  lineageDepth: number
}): number {
  const contentAnchor = getFolderBackedRepoWorktreeCardContentIndent(args)
  const genericSurfaceInset = getWorktreeCardSurfaceInset({
    isGrouped: true,
    groupDepth: args.groupDepth
  })
  const maxSurfaceInset =
    contentAnchor - WORKTREE_CARD_SURFACE_MARGIN - FLUSH_CARD_MIN_CONTENT_INSET

  // Why: compact folder-backed repo rows still use flush-card margin/padding;
  // cap the surface before those fixed insets overshoot the target anchor.
  return Math.min(genericSurfaceInset, Math.max(0, maxSurfaceInset))
}

function getFolderWorkspaceCardContentIndent(args: { groupDepth: number }): number {
  const parentGroupDepth = Math.max(0, clampDepth(args.groupDepth) - 1)
  // Why: folder workspaces are direct children of their owning folder group,
  // so they advance by the same compact header step as group -> repo.
  return getProjectGroupHeaderPaddingLeft(parentGroupDepth) + PROJECT_GROUP_HEADER_INDENT
}

function getFolderWorkspaceCardSurfaceInset(args: {
  isGrouped: boolean
  groupDepth: number
}): number {
  const contentAnchor = getFolderWorkspaceCardContentIndent({ groupDepth: args.groupDepth })
  const genericSurfaceInset = getWorktreeCardSurfaceInset(args)
  const maxSurfaceInset =
    contentAnchor - WORKTREE_CARD_SURFACE_MARGIN - FLUSH_CARD_MIN_CONTENT_INSET

  // Why: flush cards add their own margin and minimum padding, so deep folder
  // workspace surfaces must be capped to keep the final content anchor compact.
  return Math.min(genericSurfaceInset, Math.max(0, maxSurfaceInset))
}

export function getFolderWorkspaceRowGeometry(args: {
  isFolderBackedWorkspaceChild: boolean
  isGrouped: boolean
  groupDepth: number
  lineageDepth: number
}): {
  surfaceInset: number
  cardContentIndent: number
} {
  if (args.isFolderBackedWorkspaceChild) {
    // Why: standalone folder workspace rows do not get a lineage wrapper
    // offset, so align them to the comparable folder-backed repo row anchor.
    const contentAnchor = getFolderBackedRepoWorktreeCardContentIndent({
      groupDepth: args.groupDepth,
      lineageDepth: 0
    })
    const surfaceInset = getFolderBackedRepoWorktreeCardSurfaceInset({
      groupDepth: args.groupDepth,
      lineageDepth: 0
    })

    return {
      surfaceInset,
      cardContentIndent: Math.max(0, contentAnchor - surfaceInset)
    }
  }

  const contentIndent = args.isFolderBackedWorkspaceChild
    ? getFolderWorkspaceCardContentIndent({
        groupDepth: args.groupDepth
      })
    : getWorktreeCardContentIndent({
        isGrouped: args.isGrouped,
        groupDepth: args.groupDepth,
        lineageDepth: args.lineageDepth
      })
  // Why: standalone folder rows share the normal worktree row surface path.
  const surfaceInset = args.isFolderBackedWorkspaceChild
    ? getFolderWorkspaceCardSurfaceInset({
        isGrouped: true,
        groupDepth: args.groupDepth
      })
    : getWorktreeCardSurfaceInset({
        isGrouped: args.isGrouped,
        groupDepth: args.groupDepth
      })

  return {
    surfaceInset,
    cardContentIndent: Math.max(0, contentIndent - surfaceInset)
  }
}

export function getWorktreeCardSurfaceInset(args: {
  isGrouped: boolean
  groupDepth: number
}): number {
  return args.isGrouped ? clampDepth(args.groupDepth) * GROUPED_WORKTREE_CARD_SURFACE_INDENT : 0
}

export function getFlushWorktreeCardPaddingLeft(
  contentIndent: number,
  preserveStatusIconTitleAnchor = false
): string {
  const pullback =
    FLUSH_CARD_CONTENT_PULLBACK +
    (preserveStatusIconTitleAnchor ? STATUS_ICON_TITLE_ANCHOR_PULLBACK_PX : 0)
  return contentIndent > 0
    ? `max(${FLUSH_CARD_MIN_CONTENT_INSET}px, calc(${contentIndent}px - ${pullback}px))`
    : `${FLUSH_CARD_MIN_CONTENT_INSET}px`
}

// Why: flush cards draw a 1px transparent border, so every content anchor
// measured from the row edge starts one pixel in.
const WORKTREE_CARD_BORDER_PX = 1
// Why: the leading status column is a fixed 20px slot; half of it is the only
// way to land a tree line on the glyph rather than beside it.
export const WORKTREE_CARD_STATUS_SLOT_WIDTH = 20
// Why: title-only cards use `py-1`, so the status glyph centre sits one border
// plus that padding below the row top — where the rail elbow has to meet it.
export const WORKTREE_CARD_STATUS_ICON_CENTER_TOP =
  WORKTREE_CARD_BORDER_PX + 4 + WORKTREE_CARD_STATUS_SLOT_WIDTH / 2

// Why: status-slot.tsx nudges its 13px artwork one pixel right because
// branch-style glyphs are optically left-heavy; tree lines must follow the nudge.
export const WORKTREE_CARD_STATUS_GLYPH_NUDGE_PX = 1
const WORKTREE_CARD_STATUS_GLYPH_INSET_PX =
  (WORKTREE_CARD_STATUS_SLOT_WIDTH - 13) / 2 + WORKTREE_CARD_STATUS_GLYPH_NUDGE_PX

/** Left edge of a card's leading status glyph, for its resolved content indent. */
export function getWorktreeCardStatusGlyphLeft(contentIndent: number): number {
  const statusInnerPadding = Math.max(
    FLUSH_CARD_MIN_CONTENT_INSET,
    contentIndent - FLUSH_CARD_CONTENT_PULLBACK - STATUS_ICON_TITLE_ANCHOR_PULLBACK_PX
  )

  return (
    WORKTREE_CARD_BORDER_PX +
    statusInnerPadding +
    getWorktreeCardLeadingStatusMarginLeft(contentIndent) +
    WORKTREE_CARD_STATUS_GLYPH_INSET_PX
  )
}

function getWorktreeCardLeadingStatusMarginLeft(contentIndent: number): number {
  if (contentIndent <= 0) {
    return 0
  }

  const baseInnerPadding = Math.max(
    FLUSH_CARD_MIN_CONTENT_INSET,
    contentIndent - FLUSH_CARD_CONTENT_PULLBACK
  )
  const statusInnerPadding = Math.max(
    FLUSH_CARD_MIN_CONTENT_INSET,
    contentIndent - FLUSH_CARD_CONTENT_PULLBACK - STATUS_ICON_TITLE_ANCHOR_PULLBACK_PX
  )
  const paddingShift = baseInnerPadding - statusInnerPadding
  const remainingShift = STATUS_ICON_TITLE_ANCHOR_PULLBACK_PX - paddingShift
  if (remainingShift <= 0) {
    return 0
  }

  // Why: shallow rows hit the flush-card padding floor; finish the status
  // alignment with margin without pulling content past the card's inner edge.
  return Math.max(-statusInnerPadding, -remainingShift)
}

export function getLineageNestedRowGeometry(): {
  surfaceInset: number
  cardContentIndent: number
  lineageChildrenInlineOffset: number
} {
  // Why: the parent card already contributes the inherited/group baseline;
  // adding global lineage depth here would double-count nested descendants.
  return {
    surfaceInset: LINEAGE_NESTED_ROW_SURFACE_INSET,
    cardContentIndent: 0,
    lineageChildrenInlineOffset: LINEAGE_CHILDREN_INLINE_OFFSET
  }
}

export function getLineageChildrenInlineStyle(offset: number | string): {
  marginLeft: string
  width: string
} {
  const inlineOffset = typeof offset === 'number' ? `${offset}px` : offset
  return {
    marginLeft: inlineOffset,
    width: `calc(100% - ${inlineOffset})`
  }
}
