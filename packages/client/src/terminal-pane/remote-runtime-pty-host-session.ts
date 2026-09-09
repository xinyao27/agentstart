import type {
  RuntimeMobileSessionTerminalClientTab,
  RuntimeMobileSessionTabsResult
} from '~renderer/runtime/remote-session/session-model'
import { toHostSessionTabId } from '~renderer/runtime/remote-terminal-surface-id'
import { requireSessionTabsClient } from '~renderer/runtime/session-tabs-target'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'

import type { RuntimePtyTransportOptions } from './pty/transport-types'
import type { RemoteRuntimePtyState } from './remote-runtime-pty-state'

const HOST_SESSION_ATTACH_POLL_MS = 150
const HOST_SESSION_ATTACH_TIMEOUT_MS = 15_000

export class RemoteRuntimePtyHostSession {
  private readonly state: RemoteRuntimePtyState
  private readonly worktreeId: string | undefined
  private readonly leafId: string | undefined

  constructor(state: RemoteRuntimePtyState, options: RuntimePtyTransportOptions) {
    this.state = state
    this.worktreeId = options.worktreeId
    this.leafId = options.leafId
  }

  async waitForHandle(tabId: string): Promise<string | null> {
    if (!this.worktreeId) {
      return null
    }
    const hostTabId = toHostSessionTabId(tabId)
    const worktree = toRuntimeWorktreeSelector(this.worktreeId)
    const activated = await this.activate(worktree, hostTabId)
    const immediate = this.findReadyHandle(activated, hostTabId)
    if (this.isSleeping(activated, hostTabId)) {
      return null
    }
    if (immediate) {
      return immediate
    }

    const startedAt = Date.now()
    while (!this.state.destroyed) {
      const remainingMs = HOST_SESSION_ATTACH_TIMEOUT_MS - (Date.now() - startedAt)
      if (remainingMs <= 0) {
        return null
      }
      // Why: host mirrors can be published before their PTY handle is ready,
      // but a stuck pending surface must not poll the runtime forever.
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(HOST_SESSION_ATTACH_POLL_MS, remainingMs))
      )
      const listed = await this.list(worktree)
      const handle = this.findReadyHandle(listed, hostTabId)
      if (handle) {
        return handle
      }
      if (this.isSleeping(listed, hostTabId) || !this.hasSurface(listed, hostTabId)) {
        return null
      }
    }
    return null
  }

  async listHandle(tabId: string): Promise<string | null> {
    if (!this.worktreeId) {
      return null
    }
    const hostTabId = toHostSessionTabId(tabId)
    const listed = await this.list(toRuntimeWorktreeSelector(this.worktreeId))
    return this.findReadyHandle(listed, hostTabId)
  }

  private isSleeping(snapshot: RuntimeMobileSessionTabsResult, tabId: string): boolean {
    return snapshot.tabs.some(
      (tab) =>
        tab.type === 'terminal' &&
        tab.parentTabId === tabId &&
        (!this.leafId || tab.leafId === this.leafId) &&
        tab.status === 'sleeping'
    )
  }

  private activate(worktree: string, hostTabId: string): Promise<RuntimeMobileSessionTabsResult> {
    return requireSessionTabsClient(this.state.target).then((client) =>
      client.activate(
        {
          worktree,
          tabId: hostTabId,
          ...(this.leafId ? { leafId: this.leafId } : {})
        },
        { timeoutMs: 15_000 }
      )
    )
  }

  private list(worktree: string): Promise<RuntimeMobileSessionTabsResult> {
    return requireSessionTabsClient(this.state.target).then((client) =>
      client.list(worktree, { timeoutMs: 15_000 })
    )
  }

  private findReadyHandle(
    snapshot: RuntimeMobileSessionTabsResult,
    hostTabId: string
  ): string | null {
    const terminalTabs = this.getSurfaces(snapshot, hostTabId, false)
    if (this.leafId) {
      const requestedLeaf = terminalTabs.find(
        (tab) =>
          tab.status === 'ready' && tab.parentTabId === hostTabId && tab.leafId === this.leafId
      )
      return requestedLeaf?.terminal ?? null
    }
    const preferred =
      terminalTabs.find(
        (tab) => tab.status === 'ready' && tab.parentTabId === hostTabId && tab.isActive
      ) ?? terminalTabs.find((tab) => tab.status === 'ready' && tab.parentTabId === hostTabId)
    return preferred?.terminal ?? null
  }

  private hasSurface(snapshot: RuntimeMobileSessionTabsResult, hostTabId: string): boolean {
    return this.getSurfaces(snapshot, hostTabId, true).length > 0
  }

  private getSurfaces(
    snapshot: RuntimeMobileSessionTabsResult,
    hostTabId: string,
    matchRequestedLeaf: boolean
  ): RuntimeMobileSessionTerminalClientTab[] {
    return snapshot.tabs.filter(
      (tab): tab is RuntimeMobileSessionTerminalClientTab =>
        tab.type === 'terminal' &&
        (tab.parentTabId === hostTabId || tab.id === hostTabId) &&
        (!matchRequestedLeaf || !this.leafId || tab.leafId === this.leafId)
    )
  }
}
