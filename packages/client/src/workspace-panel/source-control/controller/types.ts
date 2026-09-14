import type { SourceControlActionError } from '~renderer/workspace-panel/source-control/tree/action-error'

export type RunRemoteActionResult =
  | { status: 'ok' }
  | { status: 'failed'; error: SourceControlActionError }
  | { status: 'superseded' }
  | { status: 'skipped' }
