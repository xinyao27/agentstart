// Why: sidebar primaries rotate labels as git/review state changes. Filling the
// pane keeps their trailing edge aligned with the surrounding editor chrome; the
// primary half must shrink first so split-button chevrons never overflow.
export const WORKSPACE_PANEL_SPLIT_ACTION_ROW_CLASS =
  'flex w-full min-w-0 items-stretch [&>*:first-child]:flex-1 [&>*:first-child>button]:w-full [&>button:first-child]:w-full'

export const WORKSPACE_PANEL_MORPHING_PRIMARY_BUTTON_CLASS = 'w-[10.5rem] min-w-0 max-w-full shrink'

// Covers "Squash and merge" and "Disable auto-merge".
export const WORKSPACE_PANEL_MERGE_PRIMARY_BUTTON_CLASS = 'w-[11.5rem] min-w-0 max-w-full shrink'

export const WORKSPACE_PANEL_PRIMARY_BUTTON_LABEL_CLASS = 'block min-w-0 truncate'
