import type { PtyDataMeta } from '~renderer/runtime/pty-data-meta'
import type { TerminalKittyKeyboardModeTracker } from '~renderer/terminal-pane/emulator/kitty-keyboard'

import {
  buildPostReplayLiveAgentReattachReset,
  POST_REPLAY_REATTACH_RESET
} from '../layout-serialization'
import type { ManagedPane } from '../pane-manager/pane-manager'
import type { TerminalStructuralReplayCoordinator } from '../pane-manager/terminal-structural-replay-coordinator'
import type { ReattachAgentSignal } from './reattach-agent-signal'
import { createReattachFocusAfterReplay } from './reattach-focus'
import { createReattachLiveData } from './reattach-live-data'
import { createReplayQueue } from './replay-queue'
import type { ReplayWriter } from './replay-writer'
import type { PtyTransport } from './transport-types'

type OutputCallbacks = Parameters<PtyTransport['connect']>[0]['callbacks']

type ReattachOutputOptions = {
  pane: ManagedPane
  transport: PtyTransport
  writer: ReplayWriter
  structuralCoordinator: TerminalStructuralReplayCoordinator
  agentSignal: ReattachAgentSignal
  kittyKeyboardModes: TerminalKittyKeyboardModeTracker
  getIsDisposed: () => boolean
  waitForOutputParsed: () => Promise<void>
  rebuildWebgl: () => void
}

export type ReattachOutput = {
  getStreamGeneration: () => number
  captureCallbacks: (onError: (message: string) => void) => {
    generation: number
    callbacks: OutputCallbacks
  }
  setOutputDelivery: (deliver: (data: string, meta?: PtyDataMeta) => void) => void
  setCancelSnapshotReplay: (cancel: () => void) => void
  dispose: () => void
}

export function createReattachOutput(options: ReattachOutputOptions): ReattachOutput {
  let streamGeneration = 0
  let deliverOutput: (data: string, meta?: PtyDataMeta) => void = () => {}
  let cancelSnapshotReplay = (): void => {}
  const dataCallback = (data: string, meta?: PtyDataMeta, generation = streamGeneration): void => {
    if (generation !== streamGeneration || liveData.defer(data, meta, generation)) {
      return
    }
    deliverOutput(data, meta)
  }
  const liveData = createReattachLiveData({
    getIsDisposed: options.getIsDisposed,
    getPtyId: options.transport.getPtyId,
    getStreamGeneration: () => streamGeneration,
    deliver: dataCallback
  })
  const afterReplay = createReattachFocusAfterReplay({
    terminal: options.pane.terminal,
    getIsDisposed: options.getIsDisposed,
    getPtyId: options.transport.getPtyId,
    getStreamGeneration: () => streamGeneration,
    getSignalGeneration: options.agentSignal.getSignalGeneration,
    getHasCursorAgentSignal: options.agentSignal.getHasCursorAgentSignal,
    clearCursorAgentSignal: options.agentSignal.clearCursorAgentSignal,
    hasLiveAgentSignal: options.agentSignal.hasLiveStatusOrTitle,
    shouldSendFocusIn: options.agentSignal.shouldSendFocusIn,
    waitForOutputParsed: options.waitForOutputParsed,
    writeReplayData: options.writer.write,
    sendInput: (data) => {
      options.transport.sendInput(data)
    }
  })
  const replayQueue = createReplayQueue({
    pane: options.pane,
    writer: options.writer,
    structuralCoordinator: options.structuralCoordinator,
    getIsDisposed: options.getIsDisposed,
    getPtyId: options.transport.getPtyId,
    getStreamGeneration: () => streamGeneration,
    preparePayload: (data, clearBeforeReplay) => {
      options.agentSignal.rememberPayload(data, { fullScreenReplay: clearBeforeReplay })
      options.kittyKeyboardModes.scanReplay(data)
    },
    getResetSequence: (payload) =>
      options.agentSignal.shouldPreserveModes()
        ? buildPostReplayLiveAgentReattachReset(payload)
        : POST_REPLAY_REATTACH_RESET,
    afterReset: afterReplay,
    rebuildWebgl: options.rebuildWebgl,
    beginLiveDataDeferral: liveData.begin,
    finishLiveDataDeferral: liveData.finish
  })

  return {
    getStreamGeneration: () => streamGeneration,
    captureCallbacks: (onError) => {
      cancelSnapshotReplay()
      const generation = (streamGeneration += 1)
      const isCurrent = (): boolean => !options.getIsDisposed() && generation === streamGeneration
      return {
        generation,
        callbacks: {
          onConnect: () => {},
          onData: (data, meta) => {
            if (isCurrent()) {
              dataCallback(data, meta, generation)
            }
          },
          onReplayData: (data, meta) => {
            if (isCurrent()) {
              replayQueue.enqueue(data, meta, generation)
            }
          },
          onError: (message) => {
            if (isCurrent()) {
              onError(message)
            }
          }
        }
      }
    },
    setOutputDelivery: (deliver) => {
      deliverOutput = deliver
    },
    setCancelSnapshotReplay: (cancel) => {
      cancelSnapshotReplay = cancel
    },
    dispose: () => {
      cancelSnapshotReplay()
    }
  }
}
