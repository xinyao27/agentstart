import type {
  WorktreeLineage as ProtocolLineage,
  WorktreeWorkspaceLineage,
  WorktreeLineageCapture as ProtocolCapture
} from '../worktree-types.js'
export type WorktreeLineage = ProtocolLineage
export type WorkspaceLineage = WorktreeWorkspaceLineage
export type WorktreeLineageCapture = ProtocolCapture
export type WorktreeLineageOrigin = ProtocolLineage['origin']
export type WorktreeLineageCaptureSource = ProtocolCapture['source']
export type WorktreeLineageCaptureConfidence = ProtocolCapture['confidence']

export type WorktreeLineageWarningCode =
  | 'LINEAGE_PARENT_CONTEXT_MISSING'
  | 'LINEAGE_PARENT_CONTEXT_CONFLICT'
  | 'LINEAGE_PARENT_INSTANCE_STALE'

export type WorktreeLineageWarning = {
  code: WorktreeLineageWarningCode
  message: string
  details?: Record<string, unknown>
}
