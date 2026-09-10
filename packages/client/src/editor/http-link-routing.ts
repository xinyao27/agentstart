import type { WorkspacePort, WorkspacePortScanResult } from '@agentstart/protocol'
import {
  shouldOpenWebLinkInAgentStartBrowser,
  type WebLinkMouseEvent
} from '~renderer/browser/link-gesture'
import {
  parseLoopbackUrlWithPort,
  type LocalhostWorktreeLabelRoute
} from '~renderer/ports/loopback-url'
import { shellClient } from '~renderer/runtime/shell-client'

import {
  readHttpLinkStore,
  type HttpLinkStore,
  type LocalhostLinkWorktree
} from './http-link-store-access'

export type OpenHttpLinkOptions = {
  event?: WebLinkMouseEvent
  openInAgentStartBrowser?: boolean
  worktreeId?: string | null
  sourceOwner?: HttpLinkSourceOwner
}

export type HttpLinkSourceOwner =
  | { kind: 'local' }
  | { kind: 'runtime'; runtimeEnvironmentId: string }
  | { kind: 'ssh'; connectionId: string }
  | { kind: 'unknown' }

// Scope: http(s) URLs only. file: URIs and in-worktree markdown targets are
// owned by resolveMarkdownLinkTarget and must stay on that path — this helper
// is only invoked on target.kind === 'external' (and for the terminal's http
// branch). A plain activation always uses the system browser; the host-platform
// modifier plus a left click opens a AgentStart Browser tab.
export function openHttpLink(url: string, opts: OpenHttpLinkOptions = {}): void {
  const { sourceOwner } = opts
  if (sourceOwner?.kind === 'unknown') {
    return
  }
  const state = readHttpLinkStore()
  const wantsAgentStartBrowser =
    opts.openInAgentStartBrowser === true || shouldOpenWebLinkInAgentStartBrowser(opts.event)
  const worktreeId = opts.worktreeId ?? state?.activeWorktreeId ?? null
  const activeRuntimeEnvironmentId = state?.settings?.activeRuntimeEnvironmentId?.trim() || null
  const runtimeEnvironmentId =
    sourceOwner?.kind === 'runtime'
      ? sourceOwner.runtimeEnvironmentId
      : sourceOwner
        ? null
        : activeRuntimeEnvironmentId
  const sourceIsLocal = sourceOwner ? sourceOwner.kind === 'local' : !activeRuntimeEnvironmentId
  const routeToAgentStart = Boolean(worktreeId) && wantsAgentStartBrowser

  if (routeToAgentStart && worktreeId && runtimeEnvironmentId) {
    void openRuntimeBrowserLink(url, worktreeId, runtimeEnvironmentId)
    return
  }

  if (routeToAgentStart && sourceIsLocal && worktreeId && state) {
    // Why: http clicks from inside a worktree should not push a worktree-switch
    // history entry — the user isn't changing worktrees, they're opening a tab
    // in the one they're already in. activateAndRevealWorktree is reserved for
    // file-link jumps that genuinely switch worktrees.
    state.setActiveWorktree(worktreeId)
    const localhostRoute = localhostLabelRouteForHttpLink(url, state, sourceOwner)
    if (!localhostRoute) {
      state.createBrowserTab(worktreeId, url, { activate: true })
      return
    }
    void openLabeledLocalhostLink(url, localhostRoute, (labeledUrl) => {
      state.createBrowserTab(worktreeId, labeledUrl, { activate: true })
    })
    return
  }

  const localhostRoute = state ? localhostLabelRouteForHttpLink(url, state, sourceOwner) : null
  if (!localhostRoute) {
    void shellClient.shell.openUrl(url)
    return
  }
  void openLabeledLocalhostLink(url, localhostRoute, (labeledUrl) => {
    void shellClient.shell.openUrl(labeledUrl)
  })
}

async function openRuntimeBrowserLink(
  url: string,
  worktreeId: string,
  runtimeEnvironmentId: string
): Promise<void> {
  try {
    const { createRemoteRuntimeSessionBrowserTab } =
      await import('~renderer/runtime/remote-runtime-session')
    const opened = await createRemoteRuntimeSessionBrowserTab({
      worktreeId,
      environmentId: runtimeEnvironmentId,
      url
    })
    if (opened) {
      return
    }
  } catch {
    // Why: the runtime can disconnect between the click and the create request.
  }
  await shellClient.shell.openUrl(url)
}

function localhostLabelRouteForHttpLink(
  url: string,
  state: HttpLinkStore,
  sourceOwner?: HttpLinkSourceOwner
): LocalhostWorktreeLabelRoute | null {
  if (sourceOwner && sourceOwner.kind !== 'local') {
    return null
  }
  if (!sourceOwner && state.settings?.activeRuntimeEnvironmentId?.trim()) {
    return null
  }
  const sourceScan =
    sourceOwner?.kind === 'local'
      ? (state.workspacePortScansByKey?.['local:all'] ?? null)
      : undefined
  return localhostLabelRouteForTerminalLink(url, state, sourceOwner?.kind === 'local', sourceScan)
}

export async function resolveLocalhostHttpLinkDisplayUrl(url: string): Promise<string | null> {
  const state = readHttpLinkStore()
  if (!state) {
    return null
  }
  const localhostRoute = localhostLabelRouteForTerminalLink(url, state)
  if (!localhostRoute) {
    return null
  }
  try {
    const result = await shellClient.localhostWorktreeLabels.register(localhostRoute)
    return result.url
  } catch {
    return null
  }
}

async function openLabeledLocalhostLink(
  fallbackUrl: string,
  route: LocalhostWorktreeLabelRoute,
  open: (url: string) => void
): Promise<void> {
  try {
    const result = await shellClient.localhostWorktreeLabels.register(route)
    open(result.url)
  } catch {
    open(fallbackUrl)
  }
}

function localhostLabelRouteForTerminalLink(
  rawUrl: string,
  state: HttpLinkStore,
  ignoreActiveRuntime = false,
  sourceScan?: WorkspacePortScanResult | null
): LocalhostWorktreeLabelRoute | null {
  if (
    state.settings?.localhostWorktreeLabelsEnabled !== true ||
    (!ignoreActiveRuntime && state.settings?.activeRuntimeEnvironmentId?.trim())
  ) {
    return null
  }
  // Why: only loopback links we can attribute to a scanned workspace port
  // should get a worktree label; everything else must stay as-is.
  const parsed = parseLoopbackUrlWithPort(rawUrl)
  if (!parsed) {
    return null
  }
  const scan = sourceScan === undefined ? state.workspacePortScan?.result : sourceScan
  const port = findWorkspacePortByNumber(scan, Number(parsed.port))
  if (!port) {
    return null
  }
  const repo = state.repos?.find((entry) => entry.id === port.owner.repoId) ?? null
  if (!repo) {
    return null
  }
  const worktree = findWorktreeById(state, port.owner.worktreeId)
  const project =
    worktree?.projectId && state.projects
      ? (state.projects.find((entry) => entry.id === worktree.projectId) ?? null)
      : null
  const projectSource = project ?? repo
  return {
    targetUrl: parsed.toString(),
    projectName: projectSource.displayName,
    worktreeName: port.owner.displayName,
    worktreePath: port.owner.path,
    repoId: repo.id,
    worktreeId: port.owner.worktreeId
  }
}

function findWorkspacePortByNumber(
  scan: WorkspacePortScanResult | null | undefined,
  portNumber: number
): (WorkspacePort & { kind: 'workspace' }) | null {
  const port =
    scan?.ports.find(
      (candidate): candidate is WorkspacePort & { kind: 'workspace' } =>
        candidate.kind === 'workspace' && candidate.port === portNumber
    ) ?? null
  return port
}

function findWorktreeById(state: HttpLinkStore, worktreeId: string): LocalhostLinkWorktree | null {
  const fromAllWorktrees = state.allWorktrees?.().find((worktree) => worktree.id === worktreeId)
  if (fromAllWorktrees) {
    return fromAllWorktrees
  }
  const worktreesByRepo = state.worktreesByRepo ?? {}
  for (const worktrees of Object.values(worktreesByRepo)) {
    const worktree = worktrees.find((entry) => entry.id === worktreeId)
    if (worktree) {
      return worktree
    }
  }
  return null
}
