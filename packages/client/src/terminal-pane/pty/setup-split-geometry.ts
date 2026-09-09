import type { SetupSplitDirection } from '@yiru/protocol/settings/workspace-preferences'

import type { ManagedPane, PaneManager } from '../pane-manager/pane-manager'

const SPLIT_GEOMETRY_EPSILON_PX = 1

function readElementRect(element: HTMLElement | null | undefined): DOMRect | null {
  try {
    return element?.getBoundingClientRect?.() ?? null
  } catch {
    return null
  }
}

function hasVisibleRect(rect: DOMRect | null): rect is DOMRect {
  return Boolean(
    rect && rect.width > SPLIT_GEOMETRY_EPSILON_PX && rect.height > SPLIT_GEOMETRY_EPSILON_PX
  )
}

function isPaneGridAlignedWithFit(pane: ManagedPane): boolean {
  try {
    const dimensions = pane.fitAddon.proposeDimensions()
    return Boolean(
      dimensions &&
      dimensions.cols > 0 &&
      dimensions.rows > 0 &&
      pane.terminal.cols === dimensions.cols &&
      pane.terminal.rows === dimensions.rows
    )
  } catch {
    return false
  }
}

export function isSetupSplitGeometryReady(
  pane: ManagedPane,
  manager: PaneManager,
  direction: SetupSplitDirection
): boolean {
  const splitElement = pane.container.parentElement
  const directionClass = direction === 'vertical' ? 'is-vertical' : 'is-horizontal'
  if (
    !splitElement?.classList?.contains('pane-split') ||
    !splitElement.classList.contains(directionClass)
  ) {
    return false
  }
  const sibling = manager
    .getPanes()
    .find(
      (candidate) => candidate.id !== pane.id && candidate.container.parentElement === splitElement
    )
  const splitRect = readElementRect(splitElement)
  const paneRect = readElementRect(pane.container)
  const siblingRect = readElementRect(sibling?.container)
  if (!hasVisibleRect(splitRect) || !hasVisibleRect(paneRect) || !hasVisibleRect(siblingRect)) {
    return false
  }
  const splitAxis = direction === 'vertical' ? splitRect.width : splitRect.height
  const paneAxis = direction === 'vertical' ? paneRect.width : paneRect.height
  const siblingAxis = direction === 'vertical' ? siblingRect.width : siblingRect.height
  return (
    paneAxis > SPLIT_GEOMETRY_EPSILON_PX &&
    siblingAxis > SPLIT_GEOMETRY_EPSILON_PX &&
    splitAxis - paneAxis > SPLIT_GEOMETRY_EPSILON_PX &&
    splitAxis - siblingAxis > SPLIT_GEOMETRY_EPSILON_PX &&
    isPaneGridAlignedWithFit(pane)
  )
}
