import type {
  SkillUpdateOperation as SkillManageOperation,
  SkillManageScope,
  SkillUpdateStartResult
} from '@yiru/protocol'
import { useSyncExternalStore } from 'react'
import { notifyInstalledAgentSkillsChanged } from '~renderer/runtime/installed-agent-skill-discovery-state'
import {
  acknowledgeSkillManageUpdateRun,
  cancelSkillManageUpdateRun,
  getSkillManageUpdateRun,
  startSkillManageInstallRun,
  startSkillManageRemoveRun,
  startSkillManageUpdateRun,
  subscribeSkillManageUpdateRun
} from '~renderer/runtime/skill-manage-client'
import type { SkillUpdateRun } from '~renderer/skills/freshness-model'

import {
  getSkillFreshnessUpdateDialogRequest,
  subscribeSkillFreshnessUpdateDialog
} from './skill-freshness-update-dialog-request'

// Why: the run outlives the dialog — closing the window must not cancel it, and
// the status-bar segment needs the same snapshot. Keeping it outside React means
// neither surface owns the lifecycle.
let run: SkillUpdateRun = { state: 'idle' }
const listeners = new Set<() => void>()
let subscribed = false
let successTimer: ReturnType<typeof setTimeout> | null = null

/** How long a finished run keeps its green check in the status bar. */
export const SKILL_UPDATE_SUCCESS_LINGER_MS = 4000

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

function clearSuccessTimer(): void {
  if (successTimer) {
    clearTimeout(successTimer)
    successTimer = null
  }
}

/**
 * Why: a success needs to be *seen*, then get out of the way. Errors stay until
 * the user acts on them. The dialog renders this same run, so retiring it while
 * the dialog is open would yank the result rows out from under someone reading
 * them — there, closing the dialog is what acknowledges the run.
 */
function scheduleSuccessLinger(): void {
  clearSuccessTimer()
  if (run.state !== 'success' || getSkillFreshnessUpdateDialogRequest() || resultHolders > 0) {
    return
  }
  successTimer = setTimeout(() => {
    successTimer = null
    void acknowledgeSkillUpdateRun()
  }, SKILL_UPDATE_SUCCESS_LINGER_MS)
}

// Opening the dialog on a lingering success hands ownership back to it.
subscribeSkillFreshnessUpdateDialog(scheduleSuccessLinger)

let resultHolders = 0

/** Same bargain the update dialog gets: while an install or remove surface is
 *  open it owns the result, so the linger must not retire it mid-read. */
export function holdSkillRunResult(): () => void {
  resultHolders += 1
  clearSuccessTimer()
  return () => {
    resultHolders = Math.max(0, resultHolders - 1)
    scheduleSuccessLinger()
  }
}

function setRun(next: SkillUpdateRun): void {
  const wasRunning = run.state === 'running'
  run = next
  scheduleSuccessLinger()
  // A run that stopped changes what's on disk — including a cancelled one, which
  // may have written several skills before the kill landed. Without this a Stop
  // leaves the rows and the count describing the pre-run scan, so the Update
  // button re-offers skills that already updated.
  if (next.state === 'success' || next.state === 'error' || (wasRunning && next.state === 'idle')) {
    notifyInstalledAgentSkillsChanged()
  }
  emit()
}

function ensureSubscribed(): void {
  if (subscribed) {
    return
  }
  subscribed = true
  subscribeSkillManageUpdateRun(setRun)
  void getSkillManageUpdateRun().then((current) => {
    // Don't clobber a live push that landed while this promise was in flight.
    if (run.state === 'idle') {
      setRun(current)
    }
  })
}

export function subscribeSkillUpdateRun(listener: () => void): () => void {
  ensureSubscribed()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSkillUpdateRun(): SkillUpdateRun {
  return run
}

export function useSkillUpdateRun(): SkillUpdateRun {
  return useSyncExternalStore(subscribeSkillUpdateRun, getSkillUpdateRun, getSkillUpdateRun)
}

const IDLE_RUN: SkillUpdateRun = { state: 'idle' }

/** Why: one runner serves update, install, and remove, so a surface that only
 *  speaks for its own verb must not narrate someone else's run. */
export function useSkillRunForOperation(operation: SkillManageOperation): SkillUpdateRun {
  const current = useSkillUpdateRun()
  return current.state === 'idle' || current.operation === operation ? current : IDLE_RUN
}

// Why: every caller fires these from an event handler with `void`. Swallowing
// here rather than at each call site keeps a dropped IPC from surfacing as an
// unhandled rejection; the run state itself is pushed from main either way.
export async function startSkillUpdateRun(names: readonly string[]): Promise<void> {
  ensureSubscribed()
  try {
    await startSkillManageUpdateRun([...names])
  } catch (error) {
    console.error('Failed to start skill update run', error)
  }
}

// Install and remove report their start result instead: the caller owns a form
// whose input is what a rejection is about.
export async function startSkillInstallRun(request: {
  source: string
  skillNames?: string[]
  scope: SkillManageScope
}): Promise<SkillUpdateStartResult | null> {
  ensureSubscribed()
  try {
    return await startSkillManageInstallRun(request)
  } catch (error) {
    console.error('Failed to start skill install run', error)
    return null
  }
}

export async function startSkillRemoveRun(request: {
  names: string[]
  scope: SkillManageScope
}): Promise<SkillUpdateStartResult | null> {
  ensureSubscribed()
  try {
    return await startSkillManageRemoveRun(request)
  } catch (error) {
    console.error('Failed to start skill remove run', error)
    return null
  }
}

export async function cancelSkillUpdateRun(): Promise<void> {
  try {
    await cancelSkillManageUpdateRun()
  } catch (error) {
    console.error('Failed to cancel skill update run', error)
  }
}

export async function acknowledgeSkillUpdateRun(): Promise<void> {
  try {
    await acknowledgeSkillManageUpdateRun()
  } catch (error) {
    console.error('Failed to acknowledge skill update run', error)
  }
}
