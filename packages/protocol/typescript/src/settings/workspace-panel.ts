export const WORKSPACE_PANEL_MIN_WIDTH = 240
export const WORKSPACE_PANEL_DEFAULT_WIDTH = 320
export const WORKSPACE_PANEL_MAX_WIDTH = 640
/** Width the workbench keeps for itself beside the column — the content area
 *  plus the navigation sidebar it may host. A wider persisted column is clamped
 *  down to it so the column can never push the workbench out of the card. */
export const WORKSPACE_PANEL_MIN_WORKBENCH_WIDTH = 480

export function computeMaxWorkspacePanelWidth(containerWidth: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return WORKSPACE_PANEL_MAX_WIDTH
  }

  return Math.min(
    WORKSPACE_PANEL_MAX_WIDTH,
    Math.max(WORKSPACE_PANEL_MIN_WIDTH, containerWidth - WORKSPACE_PANEL_MIN_WORKBENCH_WIDTH)
  )
}

export function clampWorkspacePanelWidth(
  width: unknown,
  containerWidth?: number,
  fallback = WORKSPACE_PANEL_DEFAULT_WIDTH
): number {
  if (typeof width !== 'number' || !Number.isFinite(width)) {
    return fallback
  }

  const maxWidth =
    containerWidth !== undefined
      ? computeMaxWorkspacePanelWidth(containerWidth)
      : WORKSPACE_PANEL_MAX_WIDTH

  return Math.min(maxWidth, Math.max(WORKSPACE_PANEL_MIN_WIDTH, width))
}
