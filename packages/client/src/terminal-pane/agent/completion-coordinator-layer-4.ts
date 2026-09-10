import { isRecognizedAgentType } from '@agentstart/protocol/agent/process/recognition'
import { detectAgentStatusFromTitle } from '~renderer/agent/title/status'

import {
  titleHasExplicitAgentIdentity,
  titleIsInconclusiveNativeDroidTitle
} from '../title-agent-identity'
import { CompletionCoordinatorLayer3 } from './completion-coordinator-layer-3'
import type { AgentCompletionStatusSnapshot } from './completion-coordinator-types'
import {
  COMPLETION_REPLAY_GUARD_MS,
  hookCompletionAgentIdentity,
  hookCompletionIdentity,
  isAttentionHookState,
  isCompletionHookState,
  titleCompletionAgentIdentity,
  titleCompletionIdentity
} from './completion-signals'

export abstract class CompletionCoordinatorLayer4 extends CompletionCoordinatorLayer3 {
  public observeTitle(title: string): void {
    this.recordPaneActivity()
    const status = detectAgentStatusFromTitle(title)
    const isInconclusiveNativeDroidTitle = titleIsInconclusiveNativeDroidTitle(title)
    const hasExplicitAgentIdentity =
      titleHasExplicitAgentIdentity(title) && !isInconclusiveNativeDroidTitle
    const hadPendingTitle = this.pendingTitle !== null
    if (hasExplicitAgentIdentity) {
      this.establishAgentEvidence()
    }

    if (status === 'working') {
      if (!this.recordTitleWorking()) {
        return
      }
    } else if (this.lastTitleStatus === 'working') {
      if (isInconclusiveNativeDroidTitle) {
        this.lastTitleStatus = status
        return
      }
      if (status === null && !titleHasExplicitAgentIdentity(title)) {
        // Why: shells commonly restore cwd titles right after a short printf
        // command. Treat generic completion titles as provisional until process
        // inspection proves an agent still owns the pane.
        this.holdTitleCompletionPending(title)
        this.lastTitleStatus = status
        return
      }
      if (this.agentIdentityEstablished && this.hasAgentRunEvidence) {
        this.markTitleCompletionNotified(title)
        this.dispatchCompletion('title', title, {
          completionIdentity: {
            source: 'title',
            identity: titleCompletionIdentity(title),
            agentIdentity: titleCompletionAgentIdentity(title)
          }
        })
      } else {
        this.holdTitleCompletionPending(title)
      }
    } else if (hadPendingTitle && status !== null && hasExplicitAgentIdentity) {
      // Why: a shell can briefly restore cwd between "Codex working" and
      // "Codex done"; the later explicit agent completion is authoritative.
      this.dropPendingTitle()
      this.markTitleCompletionNotified(title)
      this.dispatchCompletion('title', title, {
        completionIdentity: {
          source: 'title',
          identity: titleCompletionIdentity(title),
          agentIdentity: titleCompletionAgentIdentity(title)
        }
      })
    }
    this.lastTitleStatus = status
  }

  public observeClassifiedTitleCompletion(title: string): void {
    if (titleHasExplicitAgentIdentity(title)) {
      this.establishAgentEvidence()
    }
    if (this.agentIdentityEstablished && this.hasAgentRunEvidence) {
      this.markTitleCompletionNotified(title)
      this.dispatchCompletion('title', title, {
        completionIdentity: {
          source: 'title',
          identity: titleCompletionIdentity(title),
          agentIdentity: titleCompletionAgentIdentity(title)
        }
      })
    } else {
      this.holdTitleCompletionPending(title)
    }
  }

  public observeHookStatus(payload: AgentCompletionStatusSnapshot): void {
    this.recordPaneActivity()
    if (this.options.shouldSuppressHookCompletion?.(payload)) {
      // Why: a suppressed permission pause must still cancel a provisional 'done'
      // so the quiet-window timer never fires a false completion notification.
      if (isAttentionHookState(payload.state)) {
        this.clearPendingHookDone()
        this.clearPendingCodexAttention()
      }
      return
    }
    if (isRecognizedAgentType(payload.agentType)) {
      this.establishAgentEvidence()
    }
    if (payload.state === 'working') {
      this.clearPendingHookDone()
      // Why: resumed work (e.g. Codex after "Approve for me") cancels the debounced
      // attention notification so the self-resolving pause never notifies.
      this.clearPendingCodexAttention()
      this.workingStatusObserved = true
      this.requiresFreshWorking = false
      this.lastCompletionIdentity = null
      this.lastAttentionToken = null
      this.currentTurn += 1
      this.dropPendingTitle()
      this.options.dispatchHookLifecycle?.(payload)
      return
    }
    if (isAttentionHookState(payload.state)) {
      // Why: a permission/elicitation pause arriving before the quiet window
      // must cancel a provisional 'done' so it never becomes a false completion.
      this.clearPendingHookDone()
      this.dispatchAttention(payload)
      return
    }
    if (isCompletionHookState(payload.state)) {
      // Why: the turn is ending, so a debounced attention from an earlier pause in
      // this turn must not fire after the completion notification.
      this.clearPendingCodexAttention()
      if (isRecognizedAgentType(payload.agentType)) {
        this.establishAgentEvidence()
      }
      const hookIdentity = hookCompletionIdentity(payload)
      if (
        hookIdentity &&
        this.lastCompletionIdentity?.source === 'hook' &&
        hookIdentity === this.lastCompletionIdentity.identity
      ) {
        // Why: activation/switching can replay the same main-process hook snapshot
        // after the 1s guard; only pending quiet-window detail should refresh.
        if (payload.state === 'done' && this.pendingHookDoneTimer !== null) {
          this.scheduleHookDoneCompletion(payload.agentType ?? this.options.paneKey, payload)
        }
        return
      }
      if (
        !this.workingStatusObserved &&
        this.lastCompletionSource === 'hook' &&
        this.lastCompletedTurn === this.currentTurn &&
        Date.now() - this.lastCompletionAt >= COMPLETION_REPLAY_GUARD_MS
      ) {
        // Why: some hook producers only emit terminal states. Treat later
        // done-only hook completions as new turns without letting title/process
        // backstops duplicate the same completion.
        this.currentTurn += 1
      }
      if (payload.state === 'done' && this.doneShouldUseQuietWindow(payload)) {
        this.lastCompletionIdentity = hookIdentity
          ? {
              source: 'hook',
              identity: hookIdentity,
              agentIdentity: hookCompletionAgentIdentity(payload)
            }
          : null
        this.scheduleHookDoneCompletion(payload.agentType ?? this.options.paneKey, payload)
        return
      }
      this.lastCompletionIdentity = hookIdentity
        ? {
            source: 'hook',
            identity: hookIdentity,
            agentIdentity: hookCompletionAgentIdentity(payload)
          }
        : null
      this.dispatchCompletion('hook', payload.agentType ?? this.options.paneKey, {
        agentStatus: payload,
        ...(this.lastCompletionIdentity ? { completionIdentity: this.lastCompletionIdentity } : {})
      })
    }
  }

  protected markTitleCompletionNotified(title: string): void {
    this.lastCompletionIdentity = {
      source: 'title',
      identity: titleCompletionIdentity(title),
      agentIdentity: titleCompletionAgentIdentity(title)
    }
  }

  public startProcessTracking(): void {
    this.pollTrackingStarted = true
    this.scheduleNextPoll()
  }

  public hasPendingHookDoneCompletion(): boolean {
    return this.pendingHookDoneTimer !== null
  }

  public resetCompletionState(resetOptions: { requireFreshWorking?: boolean } = {}): void {
    this.clearPendingHookDone()
    this.clearPendingCodexAttention()
    this.dropPendingTitle()
    this.agentIdentityEstablished = false
    this.hasAgentRunEvidence = false
    this.workingStatusObserved = false
    this.lastTitleStatus = null
    this.lastCompletionToken = null
    this.lastCompletionAt = 0
    this.lastCompletedTurn = null
    this.lastCompletionSource = null
    this.lastCompletionIdentity = null
    this.lastAttentionToken = null
    this.lastForegroundAgent = null
    this.requiresFreshWorking = resetOptions.requireFreshWorking ?? false
    this.inspectionGeneration += 1
  }
}
