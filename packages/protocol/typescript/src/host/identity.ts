export const LOCAL_EXECUTION_HOST_ID = 'local'
export const ALL_EXECUTION_HOSTS_SCOPE = 'all'

export type ExecutionHostKind = 'local' | 'runtime' | 'ssh' | 'wsl'
export type ExecutionHostId =
  | typeof LOCAL_EXECUTION_HOST_ID
  | `runtime:${string}`
  | `ssh:${string}`
  | `wsl:${string}`

export type ExecutionHostScope = typeof ALL_EXECUTION_HOSTS_SCOPE | ExecutionHostId

export type ParsedExecutionHost =
  | { kind: 'local'; id: typeof LOCAL_EXECUTION_HOST_ID }
  | { kind: 'runtime'; id: `runtime:${string}`; environmentId: string }
  | { kind: 'ssh'; id: `ssh:${string}`; target: string }
  | { kind: 'wsl'; id: `wsl:${string}`; distribution: string }

type RepoExecutionHost = {
  connectionId?: string | null
  executionHostId?: ExecutionHostId | null
}

type WorktreeExecutionHost = {
  hostId?: ExecutionHostId | null
}

type FocusedExecutionHostSettings = {
  activeRuntimeEnvironmentId?: string | null
}

function normalizeHostPart(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function toRuntimeExecutionHostId(environmentId: string): `runtime:${string}` {
  return `runtime:${encodeURIComponent(environmentId)}`
}

export function toSshExecutionHostId(target: string): `ssh:${string}` {
  return `ssh:${encodeURIComponent(target)}`
}

export function toWslExecutionHostId(distribution: string): `wsl:${string}` {
  return `wsl:${encodeURIComponent(distribution)}`
}

export function parseExecutionHostId(value: string | null | undefined): ParsedExecutionHost | null {
  const normalized = normalizeHostPart(value)
  if (!normalized) {
    return null
  }
  if (normalized === LOCAL_EXECUTION_HOST_ID) {
    return { kind: 'local', id: LOCAL_EXECUTION_HOST_ID }
  }
  const prefix = ['runtime:', 'ssh:', 'wsl:'].find((candidate) => normalized.startsWith(candidate))
  if (prefix) {
    const encoded = normalized.slice(prefix.length)
    if (!encoded) {
      return null
    }
    try {
      const value = decodeURIComponent(encoded)
      if (!value) {
        return null
      }
      switch (prefix) {
        case 'runtime:':
          return { environmentId: value, id: `runtime:${encoded}`, kind: 'runtime' }
        case 'ssh:':
          return { id: `ssh:${encoded}`, kind: 'ssh', target: value }
        case 'wsl:':
          return { distribution: value, id: `wsl:${encoded}`, kind: 'wsl' }
      }
    } catch {
      return null
    }
  }
  return null
}

export function normalizeExecutionHostId(value: string | null | undefined): ExecutionHostId | null {
  return parseExecutionHostId(value)?.id ?? null
}

export function normalizeExecutionHostScope(value: string | null | undefined): ExecutionHostScope {
  const normalized = normalizeHostPart(value)
  if (!normalized || normalized === ALL_EXECUTION_HOSTS_SCOPE) {
    return ALL_EXECUTION_HOSTS_SCOPE
  }
  return normalizeExecutionHostId(normalized) ?? ALL_EXECUTION_HOSTS_SCOPE
}

export function normalizeVisibleExecutionHostIds(
  value: readonly string[] | null | undefined
): ExecutionHostId[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const ids: ExecutionHostId[] = []
  const seen = new Set<ExecutionHostId>()
  for (const raw of value) {
    const id = normalizeExecutionHostId(raw)
    if (!id || seen.has(id)) {
      continue
    }
    seen.add(id)
    ids.push(id)
  }
  return ids.length > 0 ? ids : null
}

export function normalizeExecutionHostOrder(
  value: readonly string[] | null | undefined
): ExecutionHostId[] {
  const normalized = normalizeVisibleExecutionHostIds(value)
  return normalized ?? []
}

export function getRepoExecutionHostId(repo: RepoExecutionHost): ExecutionHostId {
  // Why: connectionId survives in older snapshots; only the explicit normalized host ID is safe
  // to route through the new local/WSL/SSH adapter registry.
  return normalizeExecutionHostId(repo.executionHostId) ?? LOCAL_EXECUTION_HOST_ID
}

export function getWorktreeExecutionHostId(
  worktree: WorktreeExecutionHost,
  repo: RepoExecutionHost | undefined,
  defaultHostId: ExecutionHostId = LOCAL_EXECUTION_HOST_ID
): ExecutionHostId {
  // Why: a runtime snapshot can identify a more precise workspace owner than the repo fallback;
  // legacy connection snapshots still use the repo's normalized host rather than UI focus.
  return (
    worktree.hostId ??
    (repo?.connectionId || repo?.executionHostId ? getRepoExecutionHostId(repo) : defaultHostId)
  )
}

export function getSettingsFocusedExecutionHostId(
  settings: FocusedExecutionHostSettings | null | undefined
): ExecutionHostId {
  const runtimeEnvironmentId = normalizeHostPart(settings?.activeRuntimeEnvironmentId)
  return runtimeEnvironmentId
    ? toRuntimeExecutionHostId(runtimeEnvironmentId)
    : LOCAL_EXECUTION_HOST_ID
}
