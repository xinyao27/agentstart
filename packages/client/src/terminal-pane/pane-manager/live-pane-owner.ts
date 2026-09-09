import type { TerminalLeafId } from '@yiru/protocol/terminal/pane-identity'

import { applyDividerStyles, applyPaneOpacity, applyRootBackground } from './pane-divider'
import { PaneIdentityRegistry } from './pane-identity-registry'
import { setLigaturesEnabled } from './pane-lifecycle'
import { toPublicPane } from './pane-public-view'
import {
  markPaneComplexScriptOutput,
  resetPaneWebglTextureAtlases,
  resumePaneRendering,
  setPaneGpuRenderingState,
  suspendPaneRendering
} from './pane-rendering-control'
import {
  getManagedPaneRenderingDiagnostics,
  refreshManagedPanes
} from './pane-rendering-diagnostics'
import { schedulePaneRevealPresent, schedulePaneRevealRepaint } from './pane-reveal-repaint'
import { applyTerminalGpuAcceleration } from './pane-terminal-gpu-acceleration'
import { fitAllPanesInternal } from './pane-tree-ops'
import { rebuildAttachedWebgl } from './pane-webgl-reattach'
import type {
  ManagedPane,
  ManagedPaneInternal,
  PaneManagerOptions,
  PaneRenderingDiagnostics,
  PaneStyleOptions
} from './types'

export abstract class LivePaneOwner {
  protected abstract root: HTMLElement
  protected abstract panes: Map<number, ManagedPaneInternal>
  protected abstract activePaneId: number | null
  protected abstract options: PaneManagerOptions
  protected abstract styleOptions: PaneStyleOptions
  protected abstract destroyed: boolean
  protected abstract renderingSuspended: boolean
  protected identities = new PaneIdentityRegistry()

  getPanes(): ManagedPane[] {
    return Array.from(this.panes.values()).map(toPublicPane)
  }

  fitAllPanes(): void {
    fitAllPanesInternal(this.panes)
  }

  refreshAllPanes(): void {
    refreshManagedPanes(this.panes.values())
  }

  getActivePane(): ManagedPane | null {
    const pane = this.activePaneId === null ? null : this.panes.get(this.activePaneId)
    return pane ? toPublicPane(pane) : null
  }

  getRenderingDiagnostics(): PaneRenderingDiagnostics[] {
    return getManagedPaneRenderingDiagnostics(this.panes.values())
  }

  hasWebglRenderer(paneId: number): boolean {
    return this.panes.get(paneId)?.webglAddon != null
  }

  getLeafId(numericPaneId: number): TerminalLeafId | null {
    return this.identities.getLeafId(numericPaneId)
  }

  getNumericIdForLeaf(leafId: string): number | null {
    return this.identities.getNumericIdForLeaf(leafId)
  }

  getLeafIdMap(): Map<number, TerminalLeafId> {
    return this.identities.getLeafIdMap()
  }

  adoptLeafId(numericPaneId: number, leafId: string): boolean {
    const pane = this.panes.get(numericPaneId)
    return pane ? this.identities.adoptPaneLeafId(numericPaneId, pane, leafId) : false
  }

  setPaneStyleOptions(options: PaneStyleOptions): void {
    this.styleOptions = { ...options }
    applyPaneOpacity(this.panes.values(), this.activePaneId, this.styleOptions)
    applyDividerStyles(this.root, this.styleOptions)
    applyRootBackground(this.root, this.styleOptions)
  }

  setPaneLigaturesEnabled(paneId: number, enabled: boolean): void {
    const pane = this.panes.get(paneId)
    if (pane) {
      setLigaturesEnabled(pane, enabled)
    }
  }

  setPaneGpuRendering(paneId: number, enabled: boolean): void {
    setPaneGpuRenderingState(this.panes, paneId, enabled)
  }

  setTerminalGpuAcceleration(mode: PaneManagerOptions['terminalGpuAcceleration']): void {
    applyTerminalGpuAcceleration(this.panes.values(), this.options, mode)
  }

  markPaneHasComplexScriptOutput(paneId: number): void {
    markPaneComplexScriptOutput(this.panes, paneId)
  }

  rebuildPaneWebgl(paneId: number): void {
    const pane = this.panes.get(paneId)
    if (pane) {
      rebuildAttachedWebgl(pane)
    }
  }

  resetWebglTextureAtlases(): void {
    resetPaneWebglTextureAtlases(this.panes.values())
  }

  scheduleRevealRepaint(): void {
    schedulePaneRevealRepaint(() => (this.destroyed ? [] : this.panes.values()))
  }

  scheduleRevealPresent(): void {
    schedulePaneRevealPresent(() => (this.destroyed ? [] : this.panes.values()))
  }

  suspendRendering(): void {
    this.renderingSuspended = true
    suspendPaneRendering(this.panes.values())
  }

  resumeRendering(): void {
    this.renderingSuspended = false
    resumePaneRendering(this.panes.values())
  }
}
