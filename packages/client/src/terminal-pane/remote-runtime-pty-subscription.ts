import { encodeRuntimePtyId } from '@yiru/protocol/terminal-identity'
import { isRemoteTerminalSurfaceTabId } from '~renderer/runtime/remote-terminal-surface-id'
import { getRuntimeTerminalMultiplexer } from '~renderer/runtime/terminal-multiplex/registry'
import { publishRendererTerminalSideEffects } from '~renderer/runtime/terminal-side-effect-client'
import { setDriverForPty } from '~renderer/terminal-pane/pane-manager/mobile-driver-state'
import { setFitOverride } from '~renderer/terminal-pane/pane-manager/mobile-fit-overrides'

import { createPtyOutputProcessor } from './pty/output-processor'
import type { RuntimePtyTransportOptions } from './pty/transport-types'
import type { RemoteRuntimePtyHostSession } from './remote-runtime-pty-host-session'
import type { RemoteRuntimePtyState } from './remote-runtime-pty-state'
import { recordTerminalFreezeBreadcrumb } from './terminal-freeze-breadcrumbs'
import { deliverPtyDataWithDeferredCredit } from './terminal-pty-ack-gate'

export class RemoteRuntimePtySubscription {
  private readonly state: RemoteRuntimePtyState
  private readonly hostSession: RemoteRuntimePtyHostSession
  private readonly clientId: string
  private readonly tabId: string | undefined
  private readonly outputProcessor: ReturnType<typeof createPtyOutputProcessor>
  private generation = 0
  private resubscribing = false
  private resubscribeRequested = false

  constructor(
    state: RemoteRuntimePtyState,
    hostSession: RemoteRuntimePtyHostSession,
    clientId: string,
    options: RuntimePtyTransportOptions
  ) {
    this.state = state
    this.hostSession = hostSession
    this.clientId = clientId
    this.tabId = options.tabId
    this.outputProcessor = createPtyOutputProcessor({ onAgentStatus: options.onAgentStatus })
  }

  clearOutputState(): void {
    this.outputProcessor.clearAccumulatedState()
  }

  async subscribe(): Promise<void> {
    const subscribedHandle = this.state.handle
    if (!subscribedHandle) {
      return
    }
    const subscribedPtyId = this.state.ptyId
    const generation = ++this.generation
    let transportClosed = false
    // Why: resize during the subscribe round-trip can hit a no-op fallback.
    // Compare with this snapshot and replay the latest viewport after install.
    const subscribedViewport = this.state.viewport
    const isCurrent = (): boolean =>
      !transportClosed &&
      generation === this.generation &&
      this.state.isCurrent(subscribedHandle, subscribedPtyId)

    const nextStream = await getRuntimeTerminalMultiplexer(this.state.target).subscribeTerminal({
      terminal: subscribedHandle,
      client: { id: this.clientId, type: 'desktop' },
      viewport: subscribedViewport ?? undefined,
      callbacks: {
        onData: (data, meta, onParsed) => {
          if (!isCurrent()) {
            onParsed()
            return
          }
          const parseStartedAt = performance.now()
          deliverPtyDataWithDeferredCredit(
            () => {
              recordTerminalFreezeBreadcrumb('multiplex-output-parsed', {
                bytes: meta.wireByteLength,
                durationMs: performance.now() - parseStartedAt
              })
              onParsed()
            },
            () =>
              this.outputProcessor.processData(data, this.state.callbacks, undefined, {
                rawLength: data.length
              })
          )
        },
        onSnapshot: (data, meta, onParsed) => {
          if ((!data && !meta?.pendingEscapeTailAnsi) || !isCurrent()) {
            onParsed()
            return
          }
          const parseStartedAt = performance.now()
          this.outputProcessor.processData(data, this.state.callbacks, {
            replayingBufferedData: true,
            suppressAttentionEvents: true,
            ...(meta?.pendingEscapeTailAnsi
              ? { pendingEscapeTailAnsi: meta.pendingEscapeTailAnsi }
              : {}),
            snapshotCols: meta.cols,
            snapshotRows: meta.rows,
            onReplayParsed: () => {
              recordTerminalFreezeBreadcrumb('multiplex-snapshot-parsed', {
                bytes: meta.wireByteLength,
                durationMs: performance.now() - parseStartedAt
              })
              onParsed()
            }
          })
        },
        onSideEffectBatch: (batch, meta) => {
          if (!isCurrent() || !subscribedPtyId) {
            return
          }
          publishRendererTerminalSideEffects({
            ptyId: subscribedPtyId,
            seq: meta.seq,
            epoch: meta.epoch,
            facts: batch.facts,
            replay: batch.replay
          })
        },
        onClearBuffer: () => {
          if (isCurrent()) {
            this.outputProcessor.processData('\x1b[2J\x1b[3J\x1b[H', this.state.callbacks)
          }
        },
        onSubscribed: () => {
          if (isCurrent()) {
            this.state.callbacks.onConnect?.()
            this.state.callbacks.onStatus?.('shell')
          }
        },
        onEnd: () => {
          if (!isCurrent()) {
            return
          }
          this.outputProcessor.clearAccumulatedState()
          this.state.endSubscription(subscribedPtyId)
        },
        onError: (message, error) => {
          if (!isCurrent()) {
            return
          }
          recordTerminalFreezeBreadcrumb('multiplex-stream-error')
          this.state.handleRemoteError(message)
          if (error?.kind === 'protocol' && !error.retryable) {
            transportClosed = true
            this.state.markTransportDisconnected()
          }
        },
        onFitOverrideChanged: (event) => {
          if (isCurrent() && subscribedPtyId) {
            setFitOverride(subscribedPtyId, event.mode, event.cols, event.rows)
          }
        },
        onDriverChanged: (driver) => {
          if (isCurrent() && subscribedPtyId) {
            setDriverForPty(subscribedPtyId, driver)
          }
        },
        onTransportClose: () => {
          recordTerminalFreezeBreadcrumb('multiplex-reconnect')
          transportClosed = true
          if (
            generation !== this.generation ||
            !this.state.isCurrent(subscribedHandle, subscribedPtyId)
          ) {
            return
          }
          this.state.clearStreamReference()
          this.scheduleResubscribe()
        }
      }
    })

    if (
      transportClosed ||
      generation !== this.generation ||
      !this.state.isCurrent(subscribedHandle, subscribedPtyId)
    ) {
      nextStream.close()
      return
    }
    this.state.installStream(subscribedHandle, nextStream)
    nextStream.setDeliveryState(this.state.delivery)
    const desiredViewport = this.state.viewport
    if (this.state.hasPendingViewportClaim && desiredViewport) {
      nextStream.claimViewport(desiredViewport.cols, desiredViewport.rows)
      this.state.finishViewportClaim(nextStream)
    } else if (
      desiredViewport &&
      (desiredViewport.cols !== subscribedViewport?.cols ||
        desiredViewport.rows !== subscribedViewport?.rows)
    ) {
      nextStream.resize(desiredViewport.cols, desiredViewport.rows)
    }
  }

  private scheduleResubscribe(): void {
    if (this.state.destroyed || !this.state.connected || !this.state.handle) {
      return
    }
    if (this.resubscribing) {
      this.resubscribeRequested = true
      return
    }
    this.resubscribing = true
    const previousHandle = this.state.handle
    void this.resubscribe(previousHandle)
      .catch((error) => {
        if (!this.state.destroyed && this.state.connected && this.state.handle) {
          this.state.clearViewportClaim()
          this.state.handleRemoteError(error)
        }
      })
      .finally(() => {
        this.resubscribing = false
        if (this.resubscribeRequested) {
          this.resubscribeRequested = false
          this.scheduleResubscribe()
        }
      })
  }

  private async resubscribe(previousHandle: string): Promise<void> {
    if (this.tabId && isRemoteTerminalSurfaceTabId(this.tabId)) {
      const nextHandle = await this.hostSession.listHandle(this.tabId)
      if (this.state.destroyed || !this.state.connected || this.state.handle !== previousHandle) {
        return
      }
      if (!nextHandle) {
        this.state.retire()
        return
      }
      if (nextHandle !== previousHandle) {
        const environmentId =
          this.state.target.kind === 'environment' ? this.state.target.environmentId : null
        this.state.replaceHandle(nextHandle, encodeRuntimePtyId(nextHandle, environmentId))
      }
    }
    await this.subscribe()
  }
}
