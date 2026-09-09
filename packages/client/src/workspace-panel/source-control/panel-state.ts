import type { TuiAgent } from '@yiru/protocol/agent/types'
import type { GitConflictOperation } from '@yiru/protocol/git/status-types'
import type { SourceControlViewMode } from '@yiru/protocol/settings/workspace-preferences'
import { pickSourceControlLaunchAgent } from '~renderer/source-control/agent-selection'

export type CommitDraftsByWorktree = Record<string, string>

export function normalizeSourceControlViewMode(value: unknown): SourceControlViewMode {
  return value === 'tree' || value === 'list' ? value : 'list'
}

export function readCommitDraftForWorktree(
  drafts: CommitDraftsByWorktree,
  worktreeId: string | null | undefined
): string {
  return drafts[worktreeId ?? ''] ?? ''
}

export function writeCommitDraftForWorktree(
  drafts: CommitDraftsByWorktree,
  worktreeId: string,
  value: string
): CommitDraftsByWorktree {
  return { ...drafts, [worktreeId]: value }
}

export function shouldRenderCommitArea(
  unresolvedConflictCount: number,
  conflictOperation: GitConflictOperation
): boolean {
  return unresolvedConflictCount === 0 && conflictOperation === 'unknown'
}

export function pickDefaultSourceControlAgent(
  defaultAgent: TuiAgent | 'blank' | null | undefined,
  detectedAgents: TuiAgent[],
  disabledAgents?: TuiAgent[]
): TuiAgent | null {
  return pickSourceControlLaunchAgent({ defaultAgent, detectedAgents, disabledAgents })
}
