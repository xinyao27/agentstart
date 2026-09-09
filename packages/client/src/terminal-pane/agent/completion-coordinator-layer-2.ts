import {
  recognizeAgentProcess,
  type RecognizedAgentProcess
} from '@yiru/protocol/agent/process/recognition'
import type { RuntimeTerminalProcessInspection } from '~renderer/runtime/terminal-inspection'

import { CompletionCoordinatorLayer1 } from './completion-coordinator-layer-1'
import type { AgentCompletionStatusSnapshot } from './completion-coordinator-types'
import {
  HOOK_DONE_QUIET_MS,
  PENDING_TITLE_MAX_TTL_MS,
  PENDING_TITLE_TTL_MS,
  hookCompletionAgentIdentity,
  hookCompletionIdentity,
  titleCompletionAgentIdentity,
  titleCompletionIdentity
} from './completion-signals'

export abstract class CompletionCoordinatorLayer2 extends CompletionCoordinatorLayer1 {
  protected scheduleHookDoneCompletion(
    title: string,
    payload: AgentCompletionStatusSnapshot
  ): void {
    this.pendingHookDoneTitle = title
    this.pendingHookDonePayload = payload
    if (this.pendingHookDoneTimer !== null) {
      return
    }
    // Why: goal/mission agents can report a temporary done state between
    // milestones. Wait for a short quiet window so resumed work can cancel it.
    this.pendingHookDoneTimer = setTimeout(() => {
      this.pendingHookDoneTimer = null
      const completionTitle = this.pendingHookDoneTitle
      const pendingPayload = this.pendingHookDonePayload
      this.pendingHookDoneTitle = null
      this.pendingHookDonePayload = null
      if (completionTitle) {
        const hookIdentity = pendingPayload ? hookCompletionIdentity(pendingPayload) : null
        this.dispatchCompletion('hook', completionTitle, {
          quietedHookDone: true,
          ...(pendingPayload ? { agentStatus: pendingPayload } : {}),
          ...(hookIdentity
            ? {
                completionIdentity: {
                  source: 'hook',
                  identity: hookIdentity,
                  agentIdentity: pendingPayload ? hookCompletionAgentIdentity(pendingPayload) : null
                }
              }
            : {})
        })
      }
    }, HOOK_DONE_QUIET_MS)
  }

  protected dropPendingTitle(): void {
    this.clearPendingTitleTimer()
    this.pendingTitle = null
  }

  protected dispatchPendingTitleIfEligible(): void {
    if (
      !this.pendingTitle ||
      !this.pendingTitle.validatedByFreshInspection ||
      !this.agentIdentityEstablished ||
      !this.hasAgentRunEvidence
    ) {
      return
    }
    const title = this.pendingTitle.title
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

  protected schedulePendingTitleExpiry(): void {
    this.clearPendingTitleTimer()
    const pending = this.pendingTitle
    if (!pending) {
      return
    }
    const remaining = pending.expiresAt - Date.now()
    if (remaining <= 0) {
      this.pendingTitle = null
      this.scheduleNextPoll()
      return
    }
    this.pendingTitleTimer = setTimeout(() => {
      this.pendingTitleTimer = null
      if (!this.pendingTitle) {
        return
      }
      if (
        !this.pendingTitle.firstInspectionFinished &&
        Date.now() < this.pendingTitle.maxExpiresAt
      ) {
        this.pendingTitle.expiresAt = Math.min(Date.now() + 500, this.pendingTitle.maxExpiresAt)
        this.schedulePendingTitleExpiry()
        return
      }
      this.pendingTitle = null
      this.scheduleNextPoll()
    }, remaining)
  }

  protected holdTitleCompletionPending(title: string): void {
    const now = Date.now()
    // Why: generic spinner titles can be just "⠋ cwd"; hold the completion
    // only long enough for one foreground-process probe to prove an agent owns it.
    this.pendingTitle = {
      id: ++this.pendingTitleSequence,
      title,
      expiresAt: Math.min(now + PENDING_TITLE_TTL_MS, now + PENDING_TITLE_MAX_TTL_MS),
      maxExpiresAt: now + PENDING_TITLE_MAX_TTL_MS,
      firstInspectionFinished: false,
      validatedByFreshInspection: false
    }
    this.schedulePendingTitleExpiry()
    this.requestInspection('pending-title')
  }

  protected handleRecognizedProcess(process: RecognizedAgentProcess): void {
    this.pendingProcessExitAgent = null
    if (this.lastForegroundAgent?.agent !== process.agent) {
      if (this.lastForegroundAgent && this.hasAgentRunEvidence) {
        if (
          this.options.shouldSuppressProcessReplacementCompletion?.(
            this.lastForegroundAgent,
            process
          ) !== true
        ) {
          this.dispatchCompletion('process-exit', this.lastForegroundAgent.processName, {
            completionIdentity: {
              source: 'process-exit',
              identity: `${this.lastForegroundAgent.agent}:${this.lastForegroundAgent.processName}`,
              agentIdentity: this.lastForegroundAgent.agent
            }
          })
        }
      }
      this.processSession += 1
    }
    this.lastForegroundAgent = process
    this.establishAgentEvidence()
  }

  protected handleProcessInspectionResult(result: RuntimeTerminalProcessInspection): boolean {
    this.consecutiveInspectionErrors = 0
    const recognized = recognizeAgentProcess(result.foregroundProcess)
    if (recognized) {
      this.handleRecognizedProcess(recognized)
      return true
    }
    if (this.pendingHookDoneTimer !== null || this.pendingCodexAttentionTimer !== null) {
      // Why: a pending quiet-window 'done' or debounced Codex attention is the
      // authoritative signal for this turn; tearing down agent evidence here (a
      // transient null/shell foreground blip before the agent process is
      // recognized) would make the timer's this.hasAgentRunEvidence guard silently
      // drop it. Keep the fail-open contract for #8387 as for the done timer.
      this.scheduleNextPoll()
      return false
    }
    if (this.lastForegroundAgent && this.hasAgentRunEvidence) {
      if (result.hasChildProcesses) {
        // Why: Codex can briefly report a shell/null foreground while its TUI or
        // child work is still alive; do not announce completion from that blip.
        this.pendingProcessExitAgent = null
        this.scheduleNextPoll()
        return false
      }
      if (
        !this.pendingProcessExitAgent ||
        this.pendingProcessExitAgent.agent !== this.lastForegroundAgent.agent ||
        this.pendingProcessExitAgent.processName !== this.lastForegroundAgent.processName
      ) {
        // Why: macOS process inspection can transiently report no foreground
        // child during prompt handoff; require the idle sample to repeat.
        this.pendingProcessExitAgent = this.lastForegroundAgent
        this.scheduleNextPoll()
        return false
      }
      const exited = this.lastForegroundAgent
      this.pendingProcessExitAgent = null
      if (this.options.shouldSuppressConfirmedProcessExitCompletion?.(exited) !== true) {
        this.dispatchCompletion('process-exit', exited.processName, {
          terminalIdleConfirmed: true,
          completionIdentity: {
            source: 'process-exit',
            identity: `${exited.agent}:${exited.processName}`,
            agentIdentity: exited.agent
          }
        })
      }
      this.lastForegroundAgent = null
      this.clearAgentRunEvidence()
    } else {
      this.lastForegroundAgent = null
      this.clearAgentRunEvidence()
    }
    return false
  }
}
