import { parseExecutionHostId, type ExecutionHostId } from '@agentstart/protocol/host/identity'
import { DEFAULT_REPO_BADGE_COLOR } from '@agentstart/protocol/project/appearance'
import type { Repo } from '@agentstart/protocol/project/repository'
import { parseWorkspaceKey } from '@agentstart/protocol/workspace/identity'
import type { Tab, TerminalTab } from '@agentstart/protocol/workspace/tabs'
import { splitWorktreeIdForFilesystem } from '@agentstart/protocol/worktree/identity'
import type { Worktree } from '@agentstart/protocol/worktree/model'

export function getNextTerminalOrdinal(tabs: TerminalTab[]): number {
  const usedOrdinals = new Set<number>()
  for (const tab of tabs) {
    const match = /^Terminal (\d+)$/.exec(tab.defaultTitle ?? tab.title)
    if (!match) {
      continue
    }
    usedOrdinals.add(Number(match[1]))
  }

  let nextOrdinal = 1
  while (usedOrdinals.has(nextOrdinal)) {
    nextOrdinal += 1
  }
  return nextOrdinal
}

export function getPendingActivationSpawnCount(value: boolean | number | undefined): number {
  if (value === true) {
    return 1
  }
  return typeof value === 'number' && value > 0 ? value : 0
}

export function consumePendingActivationSpawn(
  value: boolean | number | undefined
): boolean | number | undefined {
  const count = getPendingActivationSpawnCount(value)
  if (count <= 1) {
    return undefined
  }
  return count === 2 ? true : count - 1
}

export function getFallbackTabTitle(tab: TerminalTab, index?: number): string {
  return (
    tab.customTitle?.trim() ||
    tab.quickCommandLabel?.trim() ||
    tab.defaultTitle?.trim() ||
    tab.title ||
    `Terminal ${(index ?? 0) + 1}`
  )
}

function getPathDisplayName(path: string, fallback: string): string {
  const normalized = path.trim().replace(/[\\/]+$/g, '')
  const basename = normalized.split(/[\\/]/).findLast(Boolean)?.trim()
  return basename || fallback
}

export function buildRuntimeSessionPlaceholders({
  repos,
  runtimeHostIdByWorkspaceSessionKey,
  worktreesByRepo
}: {
  repos: readonly Repo[]
  runtimeHostIdByWorkspaceSessionKey: Record<string, ExecutionHostId>
  worktreesByRepo: Record<string, Worktree[]>
}): { repos: Repo[]; worktreesByRepo: Record<string, Worktree[]> } {
  let nextRepos = repos.slice()
  let nextWorktreesByRepo = worktreesByRepo
  for (const workspaceSessionKey of Object.keys(runtimeHostIdByWorkspaceSessionKey)) {
    const hostId = runtimeHostIdByWorkspaceSessionKey[workspaceSessionKey]
    if (parseExecutionHostId(hostId)?.kind !== 'runtime') {
      continue
    }
    const workspaceScope = parseWorkspaceKey(workspaceSessionKey)
    if (workspaceScope?.type === 'folder') {
      continue
    }
    const worktreeId =
      workspaceScope?.type === 'worktree' ? workspaceScope.worktreeId : workspaceSessionKey
    // Why: folder-workspace instance IDs carry a synthetic `::workspace:<uuid>`
    // suffix. The placeholder's `id` keeps it for identity, but `path`/display
    // must be the real folder path so Git and other filesystem callers do not
    // spawn against a nonexistent cwd — matching the authoritative worktree.
    const parsed = splitWorktreeIdForFilesystem(worktreeId)
    if (!parsed) {
      continue
    }
    const existingRepo = nextRepos.some((repo) => repo.id === parsed.repoId)
    if (!existingRepo) {
      // Why: remote catalogs load after hydration, but host-split session
      // writes need owner metadata. If any repo with this id already exists,
      // avoid duplicate ids; the worktree placeholder below carries hostId.
      nextRepos = [
        ...nextRepos,
        {
          id: parsed.repoId,
          path: parsed.worktreePath,
          displayName: getPathDisplayName(parsed.worktreePath, parsed.repoId),
          badgeColor: DEFAULT_REPO_BADGE_COLOR,
          addedAt: 0,
          connectionId: null,
          executionHostId: hostId
        }
      ]
    }
    const current = nextWorktreesByRepo[parsed.repoId] ?? []
    if (current.some((worktree) => worktree.id === worktreeId)) {
      continue
    }
    const placeholder: Worktree = {
      id: worktreeId,
      repoId: parsed.repoId,
      hostId,
      displayName: getPathDisplayName(parsed.worktreePath, parsed.repoId),
      comment: '',
      linkedPR: null,
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 0,
      lastActivityAt: 0,
      path: parsed.worktreePath,
      head: '',
      branch: '',
      isBare: false,
      isMainWorktree: false
    }
    nextWorktreesByRepo =
      nextWorktreesByRepo === worktreesByRepo ? { ...worktreesByRepo } : nextWorktreesByRepo
    nextWorktreesByRepo[parsed.repoId] = [...current, placeholder]
  }
  return { repos: nextRepos, worktreesByRepo: nextWorktreesByRepo }
}

let terminalTabOwnerCacheSource: Record<string, TerminalTab[]> | null = null
let terminalTabOwnerCache = new Map<string, string>()

export function getTerminalTabOwnerWorktreeId(
  tabsByWorktree: Record<string, TerminalTab[]>,
  tabId: string
): string | null {
  if (terminalTabOwnerCacheSource !== tabsByWorktree) {
    const nextCache = new Map<string, string>()
    for (const [worktreeId, tabs] of Object.entries(tabsByWorktree)) {
      for (const tab of tabs) {
        nextCache.set(tab.id, worktreeId)
      }
    }
    terminalTabOwnerCacheSource = tabsByWorktree
    terminalTabOwnerCache = nextCache
  }
  return terminalTabOwnerCache.get(tabId) ?? null
}

export function updateUnifiedTerminalLabel(
  unifiedTabs: Tab[],
  terminalTabId: string,
  label: string
): Tab[] | null {
  const unifiedIndex = unifiedTabs.findIndex(
    (entry) => entry.contentType === 'terminal' && entry.entityId === terminalTabId
  )
  if (unifiedIndex === -1 || unifiedTabs[unifiedIndex]?.label === label) {
    return null
  }
  return unifiedTabs.map((entry, index) => (index === unifiedIndex ? { ...entry, label } : entry))
}

export function updateUnifiedTerminalGeneratedLabel(
  unifiedTabs: Tab[],
  terminalTabId: string,
  generatedLabel: string
): Tab[] | null {
  const unifiedIndex = unifiedTabs.findIndex(
    (entry) => entry.contentType === 'terminal' && entry.entityId === terminalTabId
  )
  if (unifiedIndex === -1 || unifiedTabs[unifiedIndex]?.generatedLabel === generatedLabel) {
    return null
  }
  return unifiedTabs.map((entry, index) =>
    index === unifiedIndex ? { ...entry, generatedLabel } : entry
  )
}
