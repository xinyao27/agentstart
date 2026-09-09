import { runtimePtyEnvironmentId } from '@yiru/protocol/terminal-identity'

import { useAppStore } from '../store/state'
import type { LinkHandlerDeps } from './terminal-link-handlers'
import {
  resolvePaneLinkCwd,
  resolveQueuedInitialCwd,
  resolveTerminalHomePathFromEnv
} from './terminal-pane-lifecycle-decisions'
import type { UseTerminalPaneLifecycleDeps } from './terminal-pane-lifecycle-types'
import { extractTerminalUncHost } from './terminal-pane-link-metadata'

type TerminalPaneLaunchContextInput = Pick<
  UseTerminalPaneLifecycleDeps,
  'cwd' | 'managerRef' | 'paneCwdRef' | 'paneTransportsRef' | 'startup' | 'tabId' | 'worktreeId'
> & {
  linkProviderDisposablesRef: LinkHandlerDeps['linkProviderDisposablesRef']
  queuedInitialCwdRef: React.RefObject<string | null | undefined>
}

type TerminalPaneLaunchContext = {
  defaultTabCwd: string
  getPaneLinkCwd: (paneId: number) => string
  linkDeps: LinkHandlerDeps
  osc7UncHost: string | null
  startupCwd: string
}

export function resolveTerminalPaneLaunchContext({
  cwd,
  linkProviderDisposablesRef,
  managerRef,
  paneCwdRef,
  paneTransportsRef,
  queuedInitialCwdRef,
  startup,
  tabId,
  worktreeId
}: TerminalPaneLaunchContextInput): TerminalPaneLaunchContext {
  const worktreePath =
    useAppStore
      .getState()
      .allWorktrees()
      .find((candidate) => candidate.id === worktreeId)?.path ??
    cwd ??
    ''
  const defaultTabCwd = cwd ?? worktreePath
  const initialCwdResolution = resolveQueuedInitialCwd(
    queuedInitialCwdRef.current,
    () => useAppStore.getState().consumeTabInitialCwd(tabId),
    defaultTabCwd
  )
  queuedInitialCwdRef.current = initialCwdResolution.queuedInitialCwd
  const startupCwd = initialCwdResolution.startupCwd
  const getPaneLinkCwd = (paneId: number): string =>
    resolvePaneLinkCwd(paneCwdRef.current, paneId, startupCwd)
  const linkDeps: LinkHandlerDeps = {
    worktreeId,
    worktreePath,
    startupCwd,
    getPaneLinkCwd,
    terminalHomePath: resolveTerminalHomePathFromEnv(startup?.env),
    managerRef,
    linkProviderDisposablesRef,
    pathExistsCache: new Map<string, boolean>(),
    getRuntimeEnvironmentIdForPane: (paneId) => {
      const ptyId = paneTransportsRef.current.get(paneId)?.getPtyId()
      return ptyId ? runtimePtyEnvironmentId(ptyId) : null
    }
  }
  return {
    defaultTabCwd,
    getPaneLinkCwd,
    linkDeps,
    osc7UncHost: extractTerminalUncHost(startupCwd),
    startupCwd
  }
}
