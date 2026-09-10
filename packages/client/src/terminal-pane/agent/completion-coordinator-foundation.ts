import type { RecognizedAgentProcess } from '@agentstart/protocol/agent/process/recognition'
import type { AgentStatus } from '~renderer/agent/title/core'
import type { RuntimeTerminalProcessInspection } from '~renderer/runtime/terminal-inspection'

import type {
  AgentCompletionCoordinatorOptions,
  AgentCompletionStatusSnapshot
} from './completion-coordinator-types'
import type {
  CompletionSource,
  LastCompletionIdentity,
  PollCadenceTier
} from './completion-signals'
import type { InspectionPriority } from './process-inspection-queue'

export abstract class CompletionCoordinatorFoundation {
  protected disposed = false
  protected agentIdentityEstablished = false
  protected hasAgentRunEvidence = false
  protected workingStatusObserved = false
  protected lastTitleStatus: AgentStatus | null = null
  protected currentTurn = 0
  protected processSession = 0
  protected lastCompletionToken: string | null = null
  protected lastCompletionAt = 0
  protected lastCompletedTurn: number | null = null
  protected lastCompletionSource: CompletionSource | null = null
  protected lastCompletionIdentity: LastCompletionIdentity | null = null
  protected lastAttentionToken: string | null = null
  protected lastForegroundAgent: RecognizedAgentProcess | null = null
  protected requiresFreshWorking = false
  protected pollTimer: ReturnType<typeof setTimeout> | null = null
  protected pendingTitleTimer: ReturnType<typeof setTimeout> | null = null
  protected pendingHookDoneTimer: ReturnType<typeof setTimeout> | null = null
  protected pendingHookDoneTitle: string | null = null
  protected pendingHookDonePayload: AgentCompletionStatusSnapshot | null = null
  protected pendingCodexAttentionTimer: ReturnType<typeof setTimeout> | null = null
  protected pendingProcessExitAgent: RecognizedAgentProcess | null = null
  protected pendingTitleSequence = 0
  protected pendingTitle: {
    id: number
    title: string
    expiresAt: number
    maxExpiresAt: number
    firstInspectionFinished: boolean
    validatedByFreshInspection: boolean
  } | null = null
  protected inspectionInFlight = false
  protected inspectionGeneration = 0
  protected consecutiveInspectionErrors = 0
  // Why: output/title activity can arrive before async PTY bind; it should
  // only re-arm cadence after the bind path starts process tracking.
  protected pollTrackingStarted = false
  // Why: tracks which cadence tier the armed poll timer was scheduled at, so a
  // tier change toward a faster cadence (hidden→visible flip, no-evidence pane
  // gaining activity or evidence) re-arms promptly instead of waiting out the
  // long delay (scheduleNextPoll otherwise no-ops while a timer is pending).
  protected pollTimerTier: PollCadenceTier | null = null
  protected lastPaneActivityAt = 0

  protected readonly options: AgentCompletionCoordinatorOptions

  constructor(options: AgentCompletionCoordinatorOptions) {
    this.options = options
  }

  protected abstract clearPollTimer(): void
  protected abstract clearPendingTitleTimer(): void
  protected abstract clearPendingHookDone(): void
  protected abstract clearPendingCodexAttention(): void
  protected abstract establishAgentEvidence(): void
  protected abstract clearAgentRunEvidence(): void
  protected abstract completionToken(source: CompletionSource): string
  protected abstract doneShouldUseQuietWindow(payload: AgentCompletionStatusSnapshot): boolean
  protected abstract hookAttentionToken(payload: AgentCompletionStatusSnapshot): string
  protected abstract completionIdentityAlreadyNotified(
    completionIdentity: LastCompletionIdentity | null | undefined
  ): boolean
  protected abstract dispatchCompletion(
    source: CompletionSource,
    title: string,
    optionsOverride: {
      quietedHookDone?: boolean
      terminalIdleConfirmed?: boolean
      agentStatus?: AgentCompletionStatusSnapshot
      completionIdentity?: LastCompletionIdentity | null
    }
  ): void
  protected abstract dispatchAttentionNotification(payload: AgentCompletionStatusSnapshot): void
  protected abstract dispatchAttention(payload: AgentCompletionStatusSnapshot): void
  protected abstract scheduleHookDoneCompletion(
    title: string,
    payload: AgentCompletionStatusSnapshot
  ): void
  protected abstract dropPendingTitle(): void
  protected abstract dispatchPendingTitleIfEligible(): void
  protected abstract schedulePendingTitleExpiry(): void
  protected abstract holdTitleCompletionPending(title: string): void
  protected abstract handleRecognizedProcess(process: RecognizedAgentProcess): void
  protected abstract handleProcessInspectionResult(
    result: RuntimeTerminalProcessInspection
  ): boolean
  protected abstract requestInspection(priority: InspectionPriority): void
  protected abstract shouldRunCadenceInspection(): boolean
  protected abstract isHiddenBackstop(): boolean
  protected abstract paneActivityWithinHotWindow(): boolean
  protected abstract currentPollTier(): PollCadenceTier
  protected abstract nextPollInterval(tier: PollCadenceTier): number
  protected abstract scheduleNextPoll(): void
  protected abstract recordPaneActivity(): void
  abstract observeOutputActivity(): void
  protected abstract recordTitleWorking(): boolean
  abstract observeTitleWorking(): void
  abstract observeTitle(title: string): void
  abstract observeClassifiedTitleCompletion(title: string): void
  abstract observeHookStatus(payload: AgentCompletionStatusSnapshot): void
  protected abstract markTitleCompletionNotified(title: string): void
  abstract startProcessTracking(): void
  abstract hasPendingHookDoneCompletion(): boolean
  abstract resetCompletionState(resetOptions?: { requireFreshWorking?: boolean }): void
  abstract dispose(): void
}
