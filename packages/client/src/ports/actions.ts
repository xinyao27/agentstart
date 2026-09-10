import type {
  WorkspacePort,
  WorkspacePortKillResult,
  WorkspacePortScanResult
} from '@agentstart/protocol'
import * as executionHost from '@agentstart/protocol/host/identity'
import { translate } from '~renderer/i18n/i18n'
import type { LocalhostWorktreeLabelRoute } from '~renderer/ports/loopback-url'
import { createRemoteRuntimeSessionBrowserTab } from '~renderer/runtime/remote-runtime-session-create'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'
import { shellClient } from '~renderer/runtime/shell-client'
import { killWorkspacePort, scanWorkspacePorts } from '~renderer/runtime/workspace-ports-target'
import type { useAppStore } from '~renderer/store/state'
import { activateAndRevealWorktree } from '~renderer/worktree/activation'

import {
  shouldOpenWebLinkInAgentStartBrowser,
  type WebLinkMouseEvent
} from '../browser/link-gesture'
import { browserUrlForPort } from './urls'

export { addressForPort } from './urls'

const WORKSPACE_PORT_STOP_SETTLE_MS = 500

export function canStopWorkspacePort(
  port: WorkspacePort
): port is WorkspacePort & { kind: 'workspace'; pid: number } {
  return port.kind === 'workspace' && Boolean(port.pid)
}

type BrowserTabCreator = ReturnType<typeof useAppStore.getState>['createBrowserTab']
type RemoteBrowserPageHandleSetter = ReturnType<
  typeof useAppStore.getState
>['setRemoteBrowserPageHandle']
type WorkspacePortScanSetter = ReturnType<typeof useAppStore.getState>['setWorkspacePortScan']
type WorkspacePortScanByKeySetter = ReturnType<
  typeof useAppStore.getState
>['setWorkspacePortScanForKey']
type WorkspacePortScanRefreshingSetter = ReturnType<
  typeof useAppStore.getState
>['setWorkspacePortScanRefreshing']

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function getPortOpenBrowserTooltipLabel(openLabel: string): string {
  return openLabel
}

export function resolvePortOpenInAgentStartBrowser({
  event
}: {
  event: WebLinkMouseEvent | undefined
}): boolean {
  return shouldOpenWebLinkInAgentStartBrowser(event)
}

function workspacePortOwnerWorktreeId(port: WorkspacePort): string | null {
  return port.kind === 'workspace' ? port.owner.worktreeId : null
}

export function goToWorkspacePortOwner(port: WorkspacePort): boolean {
  const worktreeId = workspacePortOwnerWorktreeId(port)
  return Boolean(worktreeId && activateAndRevealWorktree(worktreeId))
}

export async function openWorkspacePortInBrowser(args: {
  port: WorkspacePort
  activeWorktreeId?: string | null
  runtimeTarget: RuntimeClientTarget
  createBrowserTab: BrowserTabCreator
  setRemoteBrowserPageHandle: RemoteBrowserPageHandleSetter
  openInAgentStartBrowser?: boolean
  localhostLabelRoute?: LocalhostWorktreeLabelRoute | null
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const rawUrl = browserUrlForPort(args.port)
  let url = rawUrl
  if (args.runtimeTarget.kind === 'local' && args.localhostLabelRoute) {
    try {
      url = (await shellClient.localhostWorktreeLabels.register(args.localhostLabelRoute)).url
    } catch {
      url = rawUrl
    }
  }
  if (args.openInAgentStartBrowser === false && args.runtimeTarget.kind === 'local') {
    try {
      await shellClient.shell.openUrl(url)
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, reason: message || 'Failed to open system browser.' }
    }
  }

  const worktreeId =
    args.port.kind === 'workspace' ? args.port.owner.worktreeId : args.activeWorktreeId
  if (!worktreeId) {
    return { ok: false, reason: 'No workspace selected for the browser.' }
  }
  activateAndRevealWorktree(worktreeId)
  if (args.runtimeTarget.kind === 'environment') {
    const created = await createRemoteRuntimeSessionBrowserTab({
      environmentId: args.runtimeTarget.environmentId,
      worktreeId,
      url
    })
    return created
      ? { ok: true }
      : {
          ok: false,
          reason: translate(
            'ports.remoteBrowserCreateFailed',
            'Failed to create remote browser tab.'
          )
        }
  }
  args.createBrowserTab(worktreeId, url, { activate: true })
  return { ok: true }
}

export async function refreshWorkspacePortScanAfterStop(args: {
  runtimeTarget: RuntimeClientTarget
  setWorkspacePortScan: WorkspacePortScanSetter
  setWorkspacePortScanForKey?: WorkspacePortScanByKeySetter
  setWorkspacePortScanRefreshing: WorkspacePortScanRefreshingSetter
  getWorkspacePortScansByKey?: () => Record<string, WorkspacePortScanResult>
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const scanKey = workspacePortScanKeyForTarget(args.runtimeTarget)
  const publishScan = (scan: WorkspacePortScanResult): void => {
    args.setWorkspacePortScanForKey?.(scanKey, scan)
    const currentScans = args.getWorkspacePortScansByKey?.() ?? {}
    const merged = mergeWorkspacePortScans({ ...currentScans, [scanKey]: scan })
    args.setWorkspacePortScan({
      key: merged && Object.keys(currentScans).length > 0 ? 'all-hosts:all' : scanKey,
      result: merged ?? scan
    })
  }
  args.setWorkspacePortScanRefreshing(true)
  try {
    let firstScan: WorkspacePortScanResult
    try {
      firstScan = await scanWorkspacePortsForTarget(args.runtimeTarget)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, reason: message || 'Workspace port scan failed.' }
    }
    publishScan(firstScan)

    // Why: stopping sends SIGTERM, and the listener can remain visible for a
    // short window. A settled re-scan keeps worktree cards from showing a stale
    // port row after the process actually exits. Failures here are swallowed
    // because the UI is already correct from the first scan; surfacing a
    // 'Failed to refresh ports' toast on top of the stop success would lie.
    await delay(WORKSPACE_PORT_STOP_SETTLE_MS)
    try {
      const settledScan = await scanWorkspacePortsForTarget(args.runtimeTarget)
      publishScan(settledScan)
    } catch {
      // Intentionally ignored: first scan already updated the UI.
    }
    return { ok: true }
  } finally {
    args.setWorkspacePortScanRefreshing(false)
  }
}

export function workspacePortRuntimeTargetKey(target: RuntimeClientTarget): string {
  return target.kind === 'local' ? 'local' : `environment:${target.environmentId}`
}

export function runtimeTargetForExecutionHostId(
  hostId: executionHost.ExecutionHostId
): RuntimeClientTarget | null {
  const parsed = executionHost.parseExecutionHostId(hostId)
  if (parsed?.kind === 'local') {
    return { kind: 'local' }
  }
  if (parsed?.kind === 'runtime') {
    return { kind: 'environment', environmentId: parsed.environmentId }
  }
  return null
}

export function workspacePortScanKeyForTarget(target: RuntimeClientTarget): string {
  return `${workspacePortRuntimeTargetKey(target)}:all`
}

export function mergeWorkspacePortScans(
  scansByKey: Record<string, WorkspacePortScanResult>
): WorkspacePortScanResult | null {
  const entries = Object.entries(scansByKey)
    .filter(([, scan]) => scan)
    .sort(([a], [b]) => a.localeCompare(b))
  if (entries.length === 0) {
    return null
  }
  if (entries.length === 1) {
    return entries[0][1]
  }
  const ports = entries.flatMap(([key, scan]) =>
    scan.ports.map((port) => ({
      ...port,
      // Why: local and runtime scanners can both report simple ids like
      // `tcp:3000`; aggregate All-hosts views need stable unique row keys.
      id: `${key}:${port.id}`
    }))
  )
  const unavailable = entries
    .map(([key, scan]) => (scan.unavailableReason ? `${key}: ${scan.unavailableReason}` : null))
    .filter((entry): entry is string => entry !== null)
  return {
    platform: 'unknown',
    scannedAt: Math.max(...entries.map(([, scan]) => scan.scannedAt)),
    ports,
    ...(unavailable.length === entries.length && unavailable.length > 0
      ? { unavailableReason: unavailable.join('; ') }
      : {})
  }
}

const inFlightWorkspacePortScans = new Map<string, Promise<WorkspacePortScanResult>>()

function workspacePortScanRequestKey(target: RuntimeClientTarget, repoId?: string): string {
  return JSON.stringify([workspacePortRuntimeTargetKey(target), repoId ?? null])
}

async function runWorkspacePortScanForTarget(
  target: RuntimeClientTarget,
  repoId?: string
): Promise<WorkspacePortScanResult> {
  return scanWorkspacePorts(target, repoId)
}

export async function scanWorkspacePortsForTarget(
  target: RuntimeClientTarget,
  repoId?: string
): Promise<WorkspacePortScanResult> {
  const key = workspacePortScanRequestKey(target, repoId)
  const existing = inFlightWorkspacePortScans.get(key)
  if (existing) {
    return existing
  }

  // Why: visible surfaces can request the same scan on the same tick
  // (focus refresh, status bar, side panel, stop refresh). Share it so one
  // UI burst cannot fan out into duplicate lsof/netstat/RPC work.
  const promise = runWorkspacePortScanForTarget(target, repoId).finally(() => {
    if (inFlightWorkspacePortScans.get(key) === promise) {
      inFlightWorkspacePortScans.delete(key)
    }
  })
  inFlightWorkspacePortScans.set(key, promise)
  return promise
}

export async function killWorkspacePortForTarget(
  target: RuntimeClientTarget,
  args: { repoId: string; pid: number; port: number }
): Promise<WorkspacePortKillResult> {
  return killWorkspacePort(target, args)
}
