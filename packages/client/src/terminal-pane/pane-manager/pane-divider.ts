import { cn } from '~renderer/ui/class-names'

import { attachDividerDrag, disposeDividerDrag, type DividerCallbacks } from './pane-divider-drag'
import type { PaneStyleOptions, ManagedPaneInternal } from './types'
// ---------------------------------------------------------------------------
// Divider creation & drag-to-resize
// ---------------------------------------------------------------------------

/** Total hit area size = visible thickness + invisible padding on each side */
function getDividerHitSize(styleOptions: PaneStyleOptions): number {
  const thickness = styleOptions.dividerThicknessPx ?? 1
  const HIT_PADDING = 3
  // Why: a hairline should not reduce the grab target users had with the old 3px default.
  const MIN_HIT_SIZE = 9
  return Math.max(thickness + HIT_PADDING * 2, MIN_HIT_SIZE)
}

export function createDivider(
  isVertical: boolean,
  styleOptions: PaneStyleOptions,
  callbacks: DividerCallbacks
): HTMLElement {
  const divider = document.createElement('div')
  divider.className = cn('pane-divider', isVertical ? 'is-vertical' : 'is-horizontal')

  // Preserve the legacy grab target without letting it consume flex layout space.
  const thickness = styleOptions.dividerThicknessPx ?? 1
  const hitSize = getDividerHitSize(styleOptions)
  if (isVertical) {
    divider.style.width = `${thickness}px`
    divider.style.cursor = 'col-resize'
  } else {
    divider.style.height = `${thickness}px`
    divider.style.cursor = 'row-resize'
  }
  divider.style.setProperty('--divider-thickness', `${thickness}px`)
  divider.style.setProperty('--divider-hit-size', `${hitSize}px`)
  divider.style.flex = 'none'
  divider.style.position = 'relative'

  attachDividerDrag(divider, isVertical, callbacks)
  return divider
}

export function disposeDivider(divider: HTMLElement): void {
  disposeDividerDrag(divider)
}

export function disposeDividersIn(root: HTMLElement): void {
  const dividers = root.querySelectorAll('.pane-divider')
  for (const divider of dividers) {
    disposeDivider(divider as HTMLElement)
  }
}

export function applyDividerStyles(root: HTMLElement, styleOptions: PaneStyleOptions): void {
  const thickness = styleOptions.dividerThicknessPx ?? 1
  const hitSize = getDividerHitSize(styleOptions)

  const dividers = root.querySelectorAll('.pane-divider')
  for (const div of dividers) {
    const el = div as HTMLElement
    const isVertical = el.classList.contains('is-vertical')
    if (isVertical) {
      el.style.width = `${thickness}px`
    } else {
      el.style.height = `${thickness}px`
    }
    // Store the visual thickness for the CSS ::after pseudo-element
    el.style.setProperty('--divider-thickness', `${thickness}px`)
    el.style.setProperty('--divider-hit-size', `${hitSize}px`)
  }
}

export function applyPaneOpacity(
  panes: Iterable<ManagedPaneInternal>,
  activePaneId: number | null,
  styleOptions: PaneStyleOptions
): void {
  const { activePaneOpacity = 1, inactivePaneOpacity = 1, opacityTransitionMs = 0 } = styleOptions

  const transition = opacityTransitionMs > 0 ? `opacity ${opacityTransitionMs}ms ease` : ''

  for (const pane of panes) {
    const isActive = pane.id === activePaneId
    pane.container.style.opacity = String(isActive ? activePaneOpacity : inactivePaneOpacity)
    pane.container.style.transition = transition
  }
}

export function applyRootBackground(root: HTMLElement, styleOptions: PaneStyleOptions): void {
  if (styleOptions.splitBackground) {
    root.style.background = styleOptions.splitBackground
  }
  if (styleOptions.paddingX !== undefined) {
    root.style.setProperty('--pane-padding-x', `${styleOptions.paddingX}px`)
  }
  if (styleOptions.paddingY !== undefined) {
    root.style.setProperty('--pane-padding-y', `${styleOptions.paddingY}px`)
  }
}
