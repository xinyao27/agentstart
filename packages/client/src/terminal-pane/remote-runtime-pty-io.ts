import { openRuntimeTerminalClient } from '~renderer/runtime/terminal-protocol'
import {
  isTerminalInputTooLargeWithDeferredMeasurement,
  iterateTerminalInputChunks
} from '~renderer/terminal-pane/pty/input-chunks'

import {
  createRemoteRuntimePtyTextBatcher,
  createRemoteRuntimeViewportBatcher,
  type RemoteRuntimePtyBatcher,
  type RemoteRuntimeViewportBatcher
} from './remote-runtime-pty-batching'
import type { RemoteRuntimePtyState } from './remote-runtime-pty-state'

const REMOTE_TERMINAL_INPUT_FLUSH_MS = 8
const REMOTE_TERMINAL_VIEWPORT_FLUSH_MS = 33

export class RemoteRuntimePtyIo {
  private readonly state: RemoteRuntimePtyState
  private readonly clientId: string
  private readonly inputBatcher: RemoteRuntimePtyBatcher
  private readonly viewportBatcher: RemoteRuntimeViewportBatcher

  constructor(state: RemoteRuntimePtyState, clientId: string) {
    this.state = state
    this.clientId = clientId
    this.inputBatcher = createRemoteRuntimePtyTextBatcher(REMOTE_TERMINAL_INPUT_FLUSH_MS, (text) =>
      this.flushInput(text)
    )
    this.viewportBatcher = createRemoteRuntimeViewportBatcher(
      REMOTE_TERMINAL_VIEWPORT_FLUSH_MS,
      (cols, rows) => this.sendViewportUpdate(cols, rows)
    )
  }

  sendInput(data: string): boolean {
    if (!this.state.connected || !this.state.handle) {
      return false
    }
    if (!data) {
      return true
    }
    // Why: callers use \r or terminal.send's enter flag for semantic Enter;
    // literal LF bytes from paste/programmatic input must survive the stream.
    return this.inputBatcher.push(data)
  }

  sendInputImmediate(data: string): boolean {
    const targetHandle = this.state.handle
    if (!this.state.connected || !targetHandle) {
      return false
    }
    if (!data) {
      return true
    }
    // Why: input can still be in async byte-length validation and absent from
    // takePending. Queue the reply behind it to preserve wire ordering.
    if (this.inputBatcher.hasPendingValidation()) {
      const accepted = this.inputBatcher.push(data)
      this.inputBatcher.flush()
      return accepted
    }
    const text = `${this.inputBatcher.takePending()}${data}`
    const stream = this.state.getCurrentStream(targetHandle)
    if (stream?.sendQueryReply(text)) {
      return true
    }
    if (this.state.hasPendingViewportClaim) {
      this.state.queueClaimInput(text)
      return true
    }
    void this.sendInputFallback(targetHandle, text)
    return true
  }

  async sendInputAccepted(data: string): Promise<boolean> {
    const targetHandle = this.state.handle
    if (!this.state.connected || !targetHandle) {
      return false
    }
    if (!data) {
      return true
    }
    await this.inputBatcher.drain()
    if (!this.isCurrentHandle(targetHandle)) {
      return false
    }
    if (
      this.state.hasPendingViewportClaim &&
      !this.state.getCurrentStream(targetHandle) &&
      !(await this.state.waitForViewportClaim())
    ) {
      return false
    }
    if (!this.isCurrentHandle(targetHandle)) {
      return false
    }
    // Why: normal sendInput may be waiting on yielded size validation; take it
    // before the acknowledged write so terminal bytes stay ordered.
    const text = `${this.inputBatcher.takePending()}${data}`
    try {
      const tooLarge = isTerminalInputTooLargeWithDeferredMeasurement(text)
      if (typeof tooLarge === 'boolean' ? tooLarge : await tooLarge) {
        return false
      }
      const stream = this.state.getCurrentStream(targetHandle)
      if (!stream) {
        return false
      }
      for (const chunk of iterateTerminalInputChunks(text)) {
        if (!this.isCurrentHandle(targetHandle) || !(await stream.sendInputAccepted(chunk))) {
          return false
        }
      }
      return true
    } catch (error) {
      this.state.handleRemoteError(error)
      return false
    }
  }

  claimViewport(cols: number, rows: number): boolean {
    if (!this.state.connected || !this.state.handle) {
      return false
    }
    this.state.setViewport(cols, rows)
    this.viewportBatcher.clear()
    this.sendViewportUpdate(cols, rows, true)
    return true
  }

  resize(cols: number, rows: number, claim = false): boolean {
    if (!this.state.connected || !this.state.handle) {
      return false
    }
    this.state.setViewport(cols, rows)
    if (claim) {
      this.viewportBatcher.clear()
      this.sendViewportUpdate(cols, rows, true)
      return true
    }
    // Why: fit emits bursts while panes move. The runtime only needs the last
    // viewport in a frame.
    this.viewportBatcher.queue(cols, rows)
    return true
  }

  flushAndClear(): void {
    this.inputBatcher.flush()
    this.inputBatcher.clear()
    this.viewportBatcher.flush()
  }

  clearInput(): void {
    this.inputBatcher.clear()
  }

  clear(): void {
    this.inputBatcher.clear()
    this.viewportBatcher.clear()
  }

  private flushInput(text: string): void {
    const targetHandle = this.state.handle
    if (!this.state.connected || !targetHandle) {
      return
    }
    const stream = this.state.getCurrentStream(targetHandle)
    if (stream?.sendInput(text)) {
      return
    }
    if (this.state.hasPendingViewportClaim) {
      // Why: a claim during subscribe/reconnect has no stream record yet. Hold
      // its input until the stream can emit claim+input in one order.
      this.state.queueClaimInput(text)
      return
    }
    void this.sendInputFallback(targetHandle, text)
  }

  private async sendInputFallback(targetHandle: string, text: string): Promise<void> {
    try {
      await (
        await openRuntimeTerminalClient(this.state.target)
      ).send({
        terminal: targetHandle,
        text,
        client: { id: this.clientId, type: 'desktop' },
        ...(this.state.viewport
          ? { viewport: this.state.viewport, claimViewport: true as const }
          : {})
      })
    } catch (error) {
      this.state.handleRemoteError(error)
    }
  }

  private sendViewportUpdate(cols: number, rows: number, claim = false): void {
    const targetHandle = this.state.handle
    if (!this.state.connected || !targetHandle) {
      return
    }
    const stream = this.state.getCurrentStream(targetHandle)
    if (stream && (claim ? stream.claimViewport(cols, rows) : stream.resize(cols, rows))) {
      if (claim) {
        this.state.finishViewportClaim(stream)
      }
      return
    }
    if (claim) {
      this.state.beginViewportClaim()
    }
    void openRuntimeTerminalClient(this.state.target)
      .then((client) =>
        client.updateViewport({
          terminal: targetHandle,
          client: { id: this.clientId, type: 'desktop' },
          viewport: { cols, rows },
          claim
        })
      )
      .catch((error) => {
        if (this.state.isGoneError(error)) {
          this.state.handleRemoteError(error)
        }
      })
  }

  private isCurrentHandle(handle: string): boolean {
    return this.state.connected && this.state.handle === handle
  }
}
