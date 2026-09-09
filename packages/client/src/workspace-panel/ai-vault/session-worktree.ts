import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId,
  type ExecutionHostId
} from '@yiru/protocol/host/identity'
import {
  createNormalizedPathInsideOrEqualMatcher,
  isRuntimePathAbsolute,
  normalizeRuntimePathForComparison
} from '@yiru/protocol/host/path'
import { parseWslUncPath } from '@yiru/protocol/host/wsl-paths'
import type { Repo } from '@yiru/protocol/project/repository'
import { splitWorktreeIdForFilesystem } from '@yiru/protocol/worktree/identity'
import type { Worktree } from '@yiru/protocol/worktree/model'
import type { AiVaultSession } from '~renderer/workspace-panel/ai-vault/session/record'

import { aiVaultWorktreeCompactPath } from './session-worktree-affordances'

export {
  aiVaultWorktreeCompactPath,
  aiVaultWorktreeJumpTooltip,
  aiVaultWorktreeStatusLabel,
  canJumpToAiVaultSessionWorktree,
  isAiVaultSessionInCurrentWorktree,
  shouldShowAiVaultSessionWorktreeLine,
  shouldShowAiVaultWorktreeStatusBadge
} from './session-worktree-affordances'

export type AiVaultSessionWorktreeStatus = 'current' | 'active' | 'archived' | 'unavailable'

export type AiVaultSessionWorktreeInfo = {
  status: AiVaultSessionWorktreeStatus
  label: string
  path: string
  worktreeId?: string
}

type WorktreeCandidate = {
  worktree: Worktree
  path: string
  hostId: ExecutionHostId
  status: Exclude<AiVaultSessionWorktreeStatus, 'current'>
  source: 'current-path' | 'prior-path'
  ownsNormalizedCwd: (normalizedCwd: string) => boolean
  normalizedPathLength: number
}

export function withAiVaultCurrentWorktreeStatus(
  worktreeInfo: AiVaultSessionWorktreeInfo | null,
  activeWorktreeId: string | null
): AiVaultSessionWorktreeInfo | null {
  if (!worktreeInfo?.worktreeId || worktreeInfo.worktreeId !== activeWorktreeId) {
    return worktreeInfo
  }
  return worktreeInfo.status === 'current' ? worktreeInfo : { ...worktreeInfo, status: 'current' }
}

function resolveWorktreeInfoFromCandidates(
  session: AiVaultSession,
  candidates: readonly WorktreeCandidate[]
): AiVaultSessionWorktreeInfo | null {
  if (!session.cwd) {
    return null
  }

  const sessionHostId = normalizeExecutionHostId(session.executionHostId)
  const normalizedCwd = normalizeRuntimePathForComparison(session.cwd)
  const matched = candidates
    .filter((candidate) => candidate.ownsNormalizedCwd(normalizedCwd))
    .filter((candidate) => !sessionHostId || candidate.hostId === sessionHostId)
    .sort(compareWorktreeCandidates)

  const best = matched[0]
  if (!best) {
    return {
      status: 'unavailable',
      label: compactPathLabel(session.cwd),
      path: session.cwd
    }
  }

  return {
    status: best.status,
    label: best.worktree.displayName || compactPathLabel(best.path),
    path: best.path,
    worktreeId: best.worktree.id
  }
}

export function extractWorktreePathFromSessionTitle(title: string): string | null {
  const trimmed = title.trim()
  if (!trimmed) {
    return null
  }

  const suffixMatch = trimmed.match(/\s-\s*Worktree:\s*(.+)$/i)
  if (suffixMatch?.[1]) {
    return suffixMatch[1].trim()
  }

  const inlineMatch = trimmed.match(/\bWorktree:\s*(.+)$/i)
  return inlineMatch?.[1]?.trim() ?? null
}

function resolveWorktreeDisplayFromCandidates(
  session: AiVaultSession,
  candidates: readonly WorktreeCandidate[]
): AiVaultSessionWorktreeInfo | null {
  const resolved = resolveWorktreeInfoFromCandidates(session, candidates)
  if (resolved) {
    return resolved
  }

  const cwd = session.cwd?.trim()
  if (cwd) {
    return unavailableWorktreeInfo(cwd)
  }

  const titlePath = extractWorktreePathFromSessionTitle(session.title)
  if (titlePath) {
    return unavailableWorktreeInfo(titlePath)
  }

  const branch = session.branch?.trim()
  if (branch) {
    return {
      status: 'unavailable',
      label: branch,
      path: branch
    }
  }

  return null
}

export function useAiVaultSessionWorktreeMap({
  sessions,
  repos = [],
  worktrees
}: {
  sessions: readonly AiVaultSession[]
  repos?: readonly Pick<Repo, 'id' | 'connectionId' | 'executionHostId'>[]
  worktrees: readonly Worktree[]
}): ReadonlyMap<string, AiVaultSessionWorktreeInfo> {
  return (() => {
    const candidates = buildWorktreeCandidates(worktrees, repos)
    return new Map(
      sessions.flatMap((session) => {
        const worktreeInfo = resolveWorktreeDisplayFromCandidates(session, candidates)
        return worktreeInfo ? [[session.id, worktreeInfo] as const] : []
      })
    )
  })()
}

function buildWorktreeCandidates(
  worktrees: readonly Worktree[],
  repos: readonly Pick<Repo, 'id' | 'connectionId' | 'executionHostId'>[]
): WorktreeCandidate[] {
  const candidates: WorktreeCandidate[] = []
  const repoById = new Map(repos.map((repo) => [repo.id, repo]))
  for (const worktree of worktrees) {
    const repo = repoById.get(worktree.repoId)
    const hostId =
      normalizeExecutionHostId(worktree.hostId) ??
      (repo ? getRepoExecutionHostId(repo) : LOCAL_EXECUTION_HOST_ID)
    if (hasUsablePath(worktree.path)) {
      candidates.push(makeWorktreeCandidate(worktree, worktree.path, hostId, 'current-path'))
    }
    for (const priorWorktreeId of worktree.priorWorktreeIds ?? []) {
      const parsed = splitWorktreeIdForFilesystem(priorWorktreeId)
      if (!parsed || parsed.repoId !== worktree.repoId || !hasUsablePath(parsed.worktreePath)) {
        continue
      }
      candidates.push(makeWorktreeCandidate(worktree, parsed.worktreePath, hostId, 'prior-path'))
    }
  }
  return candidates
}

function makeWorktreeCandidate(
  worktree: Worktree,
  path: string,
  hostId: ExecutionHostId,
  source: WorktreeCandidate['source']
): WorktreeCandidate {
  const ownsCwd = createNormalizedPathInsideOrEqualMatcher(path)
  const wslPath = parseWslUncPath(path)
  const ownsCwdViaWslAlias = wslPath
    ? createNormalizedPathInsideOrEqualMatcher(wslPath.linuxPath)
    : null
  return {
    worktree,
    path,
    hostId,
    status: worktree.isArchived ? 'archived' : 'active',
    source,
    ownsNormalizedCwd: (normalizedCwd) =>
      ownsCwd(normalizedCwd) || (ownsCwdViaWslAlias?.(normalizedCwd) ?? false),
    normalizedPathLength: normalizeRuntimePathForComparison(path).length
  }
}

function hasUsablePath(pathValue: string): boolean {
  const trimmed = pathValue.trim()
  return Boolean(trimmed && isRuntimePathAbsolute(trimmed))
}

function compareWorktreeCandidates(left: WorktreeCandidate, right: WorktreeCandidate): number {
  const lengthDifference = right.normalizedPathLength - left.normalizedPathLength
  if (lengthDifference !== 0) {
    return lengthDifference
  }
  if (left.source === right.source) {
    return 0
  }
  return left.source === 'current-path' ? -1 : 1
}

function unavailableWorktreeInfo(pathValue: string): AiVaultSessionWorktreeInfo {
  return {
    status: 'unavailable',
    label: compactPathLabel(pathValue),
    path: pathValue
  }
}

function compactPathLabel(pathValue: string): string {
  return aiVaultWorktreeCompactPath(pathValue)
}
