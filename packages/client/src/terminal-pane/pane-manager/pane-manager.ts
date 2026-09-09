// Why: this class is the umbrella entry for the divider/drag-handle DOM
// pane-divider.ts and pane-dom-creation.ts create, and it's only constructed
// from the terminal-pane lazy chunk (use-terminal-pane-lifecycle.ts) — so its
// CSS ships in that chunk instead of the app's eager main.css.
import './pane-manager.css'
import { FIRST_PANE_ID } from '~renderer/terminal-pane/pane-manager/first-pane-id'

import { shouldFollowMouseFocus } from './focus-follows-mouse'
import { LivePaneOwner } from './live-pane-owner'
import { activateManagedPane } from './pane-activation'
import { equalizeManagedPaneSizes, mountInitialManagedPane } from './pane-collection-layout'
import { createManagedPane } from './pane-creation'
import { createDivider, disposeDividersIn } from './pane-divider'
import { createPaneDragCallbacks } from './pane-drag-callbacks'
import { beginPaneDragFromPointerDown } from './pane-drag-pointer'
import { cancelActivePaneDrag, createDragReorderState, handlePaneDrop } from './pane-drag-reorder'
import { disposePane } from './pane-lifecycle'
import { toPublicPane } from './pane-public-view'
import { PaneReparentFrameTracker } from './pane-reparent-frame-tracker'
import {
  closeManagedPane,
  detachManagedPaneForExternalMove,
  splitManagedPane
} from './pane-split-close'
import type { SplitPaneAroundLeafIdsOptions } from './pane-subtree-split'
import { splitPaneAroundMountedSubtree } from './pane-subtree-split'
import { refitPanesUnder } from './pane-tree-ops'
import { registerLivePaneManager, unregisterLivePaneManager } from './registry'
import type {
  PaneManagerOptions,
  PaneStyleOptions,
  ManagedPane,
  ManagedPaneInternal,
  DropZone,
  PaneExternalDropHandler,
  PaneExternalDropResolver,
  PaneExternalDropTarget
} from './types'

export type {
  PaneManagerOptions,
  PaneStyleOptions,
  ManagedPane,
  DropZone,
  PaneExternalDropTarget,
  PaneExternalDropResolver,
  PaneExternalDropHandler
}

export class PaneManager extends LivePaneOwner {
  protected root: HTMLElement
  protected panes: Map<number, ManagedPaneInternal> = new Map()
  protected activePaneId: number | null = null
  private nextPaneId = FIRST_PANE_ID
  protected options: PaneManagerOptions
  protected styleOptions: PaneStyleOptions = {}
  protected destroyed = false
  protected renderingSuspended: boolean
  private paneReparentFrames = new PaneReparentFrameTracker()

  // Drag-to-reorder state
  private dragState = createDragReorderState()

  constructor(root: HTMLElement, options: PaneManagerOptions) {
    super()
    this.root = root
    this.options = options
    this.renderingSuspended = options.initialRenderingSuspended === true
    // Why: atlas recovery must reach every live manager — see
    // resetAllTerminalWebglAtlases for the shared-atlas rationale.
    registerLivePaneManager(this)
  }

  createInitialPane(opts?: { focus?: boolean; leafId?: string }): ManagedPane {
    const pane = this.createPaneInternal(opts?.leafId)
    this.activePaneId = pane.id
    return mountInitialManagedPane({
      pane,
      root: this.root,
      panes: this.panes,
      styleOptions: this.styleOptions,
      focus: opts?.focus !== false,
      publish: (createdPane) => this.publishPaneCreated(createdPane)
    })
  }

  splitPane(
    paneId: number,
    direction: 'vertical' | 'horizontal',
    opts?: { ratio?: number; cwd?: string; leafId?: string; ptyId?: string }
  ): ManagedPane | null {
    return splitManagedPane({
      paneId,
      direction,
      opts,
      panes: this.panes,
      root: this.root,
      styleOptions: this.styleOptions,
      managerOptions: this.options,
      createPaneInternal: (leafIdHint) => this.createPaneInternal(leafIdHint),
      createDivider: (isVertical) => this.createDividerWrapped(isVertical),
      publishPaneCreated: (pane, spawnHints) => this.publishPaneCreated(pane, spawnHints),
      getDragCallbacks: () => this.getDragCallbacks(),
      setActivePaneId: (id) => {
        this.activePaneId = id
      },
      isDestroyed: () => this.destroyed
    })
  }

  splitPaneAroundLeafIds(
    sourceLeafIds: readonly string[],
    fallbackPaneId: number,
    direction: 'vertical' | 'horizontal',
    opts?: SplitPaneAroundLeafIdsOptions
  ): ManagedPane | null {
    return splitPaneAroundMountedSubtree({
      sourceLeafIds,
      fallbackPaneId,
      direction,
      opts,
      panes: this.panes,
      root: this.root,
      styleOptions: this.styleOptions,
      managerOptions: this.options,
      getNumericIdForLeaf: (leafId) => this.identities.getNumericIdForLeaf(leafId),
      createPaneInternal: (leafIdHint) => this.createPaneInternal(leafIdHint),
      createDivider: (isVertical) => this.createDividerWrapped(isVertical),
      publishPaneCreated: (pane, spawnHints) => this.publishPaneCreated(pane, spawnHints),
      getDragCallbacks: () => this.getDragCallbacks(),
      setActivePaneId: (id) => {
        this.activePaneId = id
      },
      isDestroyed: () => this.destroyed
    })
  }

  closePane(paneId: number): void {
    closeManagedPane({
      paneId,
      activePaneId: this.activePaneId,
      panes: this.panes,
      root: this.root,
      styleOptions: this.styleOptions,
      managerOptions: this.options,
      getDragCallbacks: () => this.getDragCallbacks(),
      releasePaneIdentity: (numericPaneId) => this.identities.release(numericPaneId),
      setActivePaneId: (id) => {
        this.activePaneId = id
      }
    })
  }

  detachPaneForExternalMove(paneId: number): boolean {
    return detachManagedPaneForExternalMove({
      paneId,
      activePaneId: this.activePaneId,
      panes: this.panes,
      root: this.root,
      styleOptions: this.styleOptions,
      managerOptions: this.options,
      getDragCallbacks: () => this.getDragCallbacks(),
      releasePaneIdentity: (numericPaneId) => this.identities.release(numericPaneId),
      setActivePaneId: (id) => {
        this.activePaneId = id
      }
    })
  }

  equalizePaneSizes(): void {
    if (this.panes.size < 2) {
      return
    }

    if (!equalizeManagedPaneSizes(this.root)) {
      return
    }

    this.options.onLayoutChanged?.()
  }

  setActivePane(paneId: number, opts?: { focus?: boolean }): void {
    this.activePaneId = activateManagedPane({
      paneId,
      focus: opts?.focus !== false,
      activePaneId: this.activePaneId,
      panes: this.panes,
      styleOptions: this.styleOptions,
      managerOptions: this.options
    })
  }

  movePane(sourcePaneId: number, targetPaneId: number, zone: DropZone): void {
    handlePaneDrop(sourcePaneId, targetPaneId, zone, this.dragState, this.getDragCallbacks())
  }

  beginPaneDragFromPointerDown(paneId: number, handle: HTMLElement, event: PointerEvent): void {
    beginPaneDragFromPointerDown(handle, paneId, this.dragState, this.getDragCallbacks(), event)
  }

  destroy(): void {
    this.destroyed = true
    unregisterLivePaneManager(this)
    cancelActivePaneDrag(this.dragState)
    this.paneReparentFrames.cancelAll()
    for (const pane of this.panes.values()) {
      disposePane(pane, this.panes)
    }
    this.identities.clear()
    disposeDividersIn(this.root)
    this.root.innerHTML = ''
    this.activePaneId = null
  }

  private createPaneInternal(leafIdHint?: string): ManagedPaneInternal {
    const id = this.nextPaneId++
    const pane = createManagedPane({
      id,
      leafIdHint,
      identities: this.identities,
      managerOptions: this.options,
      dragState: this.dragState,
      getDragCallbacks: () => this.getDragCallbacks(),
      renderingSuspended: this.renderingSuspended,
      isDestroyed: () => this.destroyed,
      setActivePane: (paneId, focus) => this.setActivePane(paneId, { focus }),
      handleMouseEnter: (paneId, event) => this.handlePaneMouseEnter(paneId, event)
    })
    this.panes.set(id, pane)
    this.identities.register(id, pane.leafId)
    return pane
  }

  private publishPaneCreated(
    pane: ManagedPaneInternal,
    spawnHints?: Parameters<NonNullable<PaneManagerOptions['onPaneCreated']>>[1]
  ): void {
    // Why: onPaneCreated wires PTY/status identity synchronously. After this
    // point, replacing the leaf id would fork YIRU_PANE_KEY from layout state.
    this.identities.markPublished(pane.id)
    void this.options.onPaneCreated?.(toPublicPane(pane), spawnHints)
  }

  private handlePaneMouseEnter(paneId: number, event: MouseEvent): void {
    if (
      shouldFollowMouseFocus({
        featureEnabled: this.styleOptions.focusFollowsMouse ?? false,
        activePaneId: this.activePaneId,
        hoveredPaneId: paneId,
        mouseButtons: event.buttons,
        windowHasFocus: document.hasFocus(),
        managerDestroyed: this.destroyed
      })
    ) {
      this.setActivePane(paneId, { focus: true })
    }
  }

  private createDividerWrapped(isVertical: boolean): HTMLElement {
    return createDivider(isVertical, this.styleOptions, {
      refitPanesUnder: (el) => refitPanesUnder(el, this.panes),
      onLayoutChanged: this.options.onLayoutChanged
    })
  }

  private getDragCallbacks() {
    return createPaneDragCallbacks({
      panes: this.panes,
      root: this.root,
      getStyleOptions: () => this.styleOptions,
      getActivePaneId: () => this.activePaneId,
      isDestroyed: () => this.destroyed,
      requestPaneReparentFrame: (callback) =>
        this.paneReparentFrames.request(callback, () => this.destroyed),
      managerOptions: this.options
    })
  }
}
