import type { AgentStatusEntry } from '@agentstart/protocol/agent/status-records'
import type { RateLimitHit } from '@agentstart/protocol/rate-limit-resume-values'
// Uses output only as a wake-up signal, then asks the runtime to inspect the
// exact Codex turn's structured rollout completion.
//
// Why the renderer initiates the probe: pane activity from local, WSL, SSH,
// and relay sessions already converges on this dispatcher. Classification
// happens host-side and never reads terminal text.
import { useEffect } from 'react'
import { inspectCodexUsageLimit } from '~renderer/runtime/rate-limit-resume-client'
import { useAppStore } from '~renderer/store/state'
import { subscribeToPtyData } from '~renderer/terminal-pane/pty/data-sidecar-subscriptions'

const INSPECTION_DEBOUNCE_MS = 250
const INSPECTION_RETRY_MS = 750

type PaneTarget = {
  ptyId: string
  tabId: string
  paneKey: string
  worktreeId: string
  sessionId: string
  transcriptPath?: string
  turnId: string
  prompt: string
}

type Attachment = {
  key: string
  unsubscribe: () => void
}

function tabIdForEntry(entry: AgentStatusEntry): string | null {
  return entry.tabId ?? entry.paneKey.split(':')[0] ?? null
}

/** Codex panes with enough structured identity to join a hook turn to its rollout. */
function collectRateLimitPaneTargets(
  agentStatusByPaneKey: Record<string, AgentStatusEntry>,
  ptyIdsByTabId: Record<string, string[]>
): PaneTarget[] {
  const targets: PaneTarget[] = []
  for (const entry of Object.values(agentStatusByPaneKey)) {
    const tabId = tabIdForEntry(entry)
    const session = entry.providerSession
    const turnId = entry.promptInteractionKey
    if (
      entry.agentType !== 'codex' ||
      entry.state === 'done' ||
      !tabId ||
      !entry.prompt.trim() ||
      !entry.worktreeId ||
      !session ||
      !turnId
    ) {
      continue
    }
    for (const ptyId of ptyIdsByTabId[tabId] ?? []) {
      targets.push({
        ptyId,
        tabId,
        paneKey: entry.paneKey,
        worktreeId: entry.worktreeId,
        sessionId: session.id,
        ...(session.transcriptPath ? { transcriptPath: session.transcriptPath } : {}),
        turnId,
        prompt: entry.prompt
      })
    }
  }
  return targets
}

function targetKey(target: PaneTarget): string {
  return [target.sessionId, target.turnId, target.prompt].join('\0')
}

async function inspectTarget(target: PaneTarget): Promise<RateLimitHit | null> {
  try {
    return await inspectCodexUsageLimit({
      ptyId: target.ptyId,
      tabId: target.tabId,
      paneKey: target.paneKey,
      worktreeId: target.worktreeId,
      sessionId: target.sessionId,
      ...(target.transcriptPath ? { transcriptPath: target.transcriptPath } : {}),
      turnId: target.turnId,
      prompt: target.prompt
    })
  } catch (error) {
    console.error('Failed to inspect Codex usage-limit event:', error)
  }
  return null
}

function attach(target: PaneTarget): Attachment {
  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight = false
  let closed = false
  let detected = false
  let retryPending = false

  const schedule = (delayMs: number): void => {
    if (closed || detected) {
      return
    }
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = null
      void inspect()
    }, delayMs)
  }

  const inspect = async (): Promise<void> => {
    if (closed || detected) {
      return
    }
    if (inFlight) {
      retryPending = true
      return
    }
    inFlight = true
    const hit = await inspectTarget(target)
    inFlight = false
    if (closed) {
      return
    }
    detected = hit !== null
    if (hit) {
      useAppStore.getState().recordRateLimitHit(hit)
    }
    if (!closed && !detected && retryPending) {
      retryPending = false
      schedule(INSPECTION_RETRY_MS)
    }
  }

  const requestInspection = (): void => {
    retryPending = true
    schedule(INSPECTION_DEBOUNCE_MS)
  }
  const unsubscribePty = subscribeToPtyData(target.ptyId, requestInspection)
  requestInspection()
  return {
    key: targetKey(target),
    unsubscribe: () => {
      closed = true
      if (timer) {
        clearTimeout(timer)
      }
      unsubscribePty()
    }
  }
}

export function useRateLimitResumeDetector(): void {
  useEffect(() => {
    const attachments = new Map<string, Attachment>()

    const detach = (ptyId: string): void => {
      attachments.get(ptyId)?.unsubscribe()
      attachments.delete(ptyId)
    }

    const sync = (): void => {
      const state = useAppStore.getState()
      const targets = collectRateLimitPaneTargets(state.agentStatusByPaneKey, state.ptyIdsByTabId)
      const seen = new Set<string>()
      for (const target of targets) {
        seen.add(target.ptyId)
        const existing = attachments.get(target.ptyId)
        if (existing && existing.key === targetKey(target)) {
          continue
        }
        detach(target.ptyId)
        attachments.set(target.ptyId, attach(target))
      }
      for (const ptyId of attachments.keys()) {
        if (!seen.has(ptyId)) {
          detach(ptyId)
        }
      }
    }

    sync()
    const unsubscribeStore = useAppStore.subscribe((state, previousState) => {
      if (
        state.agentStatusByPaneKey === previousState.agentStatusByPaneKey &&
        state.ptyIdsByTabId === previousState.ptyIdsByTabId
      ) {
        return
      }
      sync()
    })

    return () => {
      unsubscribeStore()
      for (const ptyId of attachments.keys()) {
        detach(ptyId)
      }
    }
  }, [])
}
