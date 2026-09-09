import type { GitStatusEntry } from '@yiru/protocol/git/status-types'
import React from 'react'
import { getFileTypeIcon } from '~renderer/file-presentation/icons'
import { translate } from '~renderer/i18n/i18n'
import {
  Minus,
  Chat as MessageSquare,
  Trash,
  Warning as TriangleAlert,
  CheckCircle as CircleCheck,
  CaretDown as ChevronDown,
  Plus,
  ArrowCounterClockwise as Undo2
} from '~renderer/icons/hugeicons'
import { basename, dirname, joinPath } from '~renderer/path'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '~renderer/ui/tooltip'
import { WORKSPACE_FILE_PATH_MIME } from '~renderer/workspace/file-drag'

import { isSubmoduleWorktreeOnlyChange } from '../discard-all-sequence'
import { STATUS_COLORS, STATUS_LABELS } from '../status-display'
import { ActionButton } from './action-button'
import { getLocalizedConflictKindLabel } from './diff-comments-inline-list'
import { canDiscardStatusEntry, canStageStatusEntry, canUnstageStatusEntry } from './entry-actions'
import { SourceControlEntryContextMenu } from './entry-context-menu'
import { DiffLineCounts } from './entry-details'
import { SUBMODULE_WORKTREE_ONLY_LABEL, SUBMODULE_WORKTREE_ONLY_TOOLTIP } from './panel-constants'
import { toPermanentSourceControlRowOpenEvent, type SourceControlRowOpenEvent } from './split-open'
import { SourceControlRowActions, SourceControlTreeRow } from './tree-row'

export const UncommittedEntryRow = function UncommittedEntryRow({
  entry,
  currentWorktreeId,
  worktreePath,
  depth = 0,
  isOpenFile = false,
  onRevealInExplorer,
  connectionId,
  onOpen,
  onStage,
  onUnstage,
  onDiscard,
  commentCount,
  showPathHint = true,
  isSubmoduleExpanded,
  onToggleSubmodule
}: {
  entry: GitStatusEntry
  currentWorktreeId: string
  worktreePath: string
  depth?: number
  isOpenFile?: boolean
  onRevealInExplorer: (worktreeId: string, absolutePath: string) => void
  connectionId?: string | null
  onOpen: (entry: GitStatusEntry, event?: SourceControlRowOpenEvent) => void
  onStage: (filePath: string) => Promise<void>
  onUnstage: (filePath: string) => Promise<void>
  onDiscard: (entry: GitStatusEntry) => void
  commentCount: number
  showPathHint?: boolean
  // When set, the row is a dirty submodule: clicking toggles lazy expansion of
  // its inner changes instead of opening a (uninformative) gitlink diff.
  isSubmoduleExpanded?: boolean
  // Why: kept as (entry) => void so one handler can serve every submodule row.
  onToggleSubmodule?: (entry: GitStatusEntry) => void
}): React.JSX.Element {
  const FileIcon = getFileTypeIcon(entry.path)
  const fileName = basename(entry.path)
  const parentDir = dirname(entry.path)
  const dirPath = parentDir === '.' ? '' : parentDir
  const isUnresolvedConflict = entry.conflictStatus === 'unresolved'
  const isSubmoduleWorktreeOnly = isSubmoduleWorktreeOnlyChange(entry)
  const conflictLabel = entry.conflictKind
    ? getLocalizedConflictKindLabel(entry.conflictKind)
    : null
  // Why: unresolved rows cannot stage before review, and all conflict rows hide
  // discard because it can erase resolution work or recreate the conflict.
  const canDiscard = canDiscardStatusEntry(entry)
  const canStage = canStageStatusEntry(entry)
  // Why: a submodule-internal staged row is read-only from the parent worktree,
  // so the parent repo's Unstage must not be offered (mirrors bulk unstage).
  const canUnstage = canUnstageStatusEntry(entry)

  return (
    <SourceControlEntryContextMenu
      currentWorktreeId={currentWorktreeId}
      absolutePath={joinPath(worktreePath, entry.path)}
      connectionId={connectionId}
      onView={() => onOpen(entry)}
      onRevealInExplorer={onRevealInExplorer}
    >
      <SourceControlTreeRow
        depth={depth}
        rowType="file"
        isCurrent={isOpenFile}
        data-testid="source-control-entry"
        data-source-control-path={entry.path}
        data-source-control-area={entry.area}
        draggable
        onDragStart={(e) => {
          if (isUnresolvedConflict && entry.status === 'deleted') {
            e.preventDefault()
            return
          }
          const absolutePath = joinPath(worktreePath, entry.path)
          e.dataTransfer.setData(WORKSPACE_FILE_PATH_MIME, absolutePath)
          e.dataTransfer.effectAllowed = 'copy'
        }}
        onClick={(e) => {
          if (onToggleSubmodule) {
            // Why: a double-click emits two click events; without this guard it
            // expands and immediately collapses the submodule row.
            if (e.detail > 1) {
              return
            }
            onToggleSubmodule(entry)
            return
          }
          onOpen(entry, e)
        }}
        onDoubleClick={(e) => {
          if (onToggleSubmodule) {
            return
          }
          onOpen(entry, toPermanentSourceControlRowOpenEvent(e))
        }}
      >
        {onToggleSubmodule && (
          <ChevronDown
            className={cn(
              'size-3 shrink-0 text-muted-foreground transition-transform',
              !isSubmoduleExpanded && '-rotate-90'
            )}
          />
        )}
        {React.createElement(FileIcon, {
          className: 'size-3.5 shrink-0',
          style: { color: STATUS_COLORS[entry.status] }
        })}
        <div className="min-w-0 flex-1 text-xs">
          <span className="block min-w-0 truncate">
            <span className="text-foreground">{fileName}</span>
            {showPathHint && dirPath && (
              <span className="text-muted-foreground ml-1.5 text-[11px]">{dirPath}</span>
            )}
          </span>
          {conflictLabel && (
            <div className="text-muted-foreground truncate text-[11px]">{conflictLabel}</div>
          )}
          {isSubmoduleWorktreeOnly && (
            // Why: parent git can stage a changed gitlink, but not nested
            // worktree dirtiness. Keep that boundary visible in the row.
            <div
              className="text-muted-foreground truncate text-[11px]"
              title={SUBMODULE_WORKTREE_ONLY_TOOLTIP}
            >
              {SUBMODULE_WORKTREE_ONLY_LABEL}
            </div>
          )}
        </div>
        {commentCount > 0 && (
          // Why: mark rows with diff notes so they are discoverable without
          // opening the Notes shelf.
          <span
            className="text-muted-foreground flex shrink-0 items-center gap-0.5 text-[10px]"
            title={translate(
              'auto.components.right.sidebar.SourceControl.657e0c90ad',
              '{{value0}} note{{value1}}',
              { value0: commentCount, value1: commentCount === 1 ? '' : 's' }
            )}
          >
            <MessageSquare className="size-3" />
            <span className="tabular-nums">{commentCount}</span>
          </span>
        )}
        {entry.conflictStatus ? (
          <ConflictBadge entry={entry} />
        ) : (
          <>
            <DiffLineCounts added={entry.added} removed={entry.removed} />
            <span
              className="w-4 shrink-0 text-center text-[10px] font-bold"
              style={{ color: STATUS_COLORS[entry.status] }}
            >
              {STATUS_LABELS[entry.status]}
            </span>
          </>
        )}
        <SourceControlRowActions>
          {canDiscard && (
            <ActionButton
              surface="row"
              icon={entry.area === 'untracked' ? Trash : Undo2}
              title={
                entry.area === 'untracked'
                  ? translate(
                      'auto.components.right.sidebar.SourceControl.11463f7a98',
                      'Delete untracked file'
                    )
                  : entry.status === 'deleted'
                    ? translate(
                        'auto.components.right.sidebar.SourceControl.989f3d5e34',
                        'Restore file'
                      )
                    : translate(
                        'auto.components.right.sidebar.SourceControl.d54dd48b0b',
                        'Discard changes'
                      )
              }
              onClick={(event) => {
                event.stopPropagation()
                onDiscard(entry)
              }}
            />
          )}
          {canStage && (
            <ActionButton
              surface="row"
              icon={Plus}
              title={translate('auto.components.right.sidebar.SourceControl.8cde1a2fb0', 'Stage')}
              onClick={(event) => {
                event.stopPropagation()
                void onStage(entry.path)
              }}
            />
          )}
          {canUnstage && (
            <ActionButton
              surface="row"
              icon={Minus}
              title={translate('auto.components.right.sidebar.SourceControl.df5040e3c3', 'Unstage')}
              onClick={(event) => {
                event.stopPropagation()
                void onUnstage(entry.path)
              }}
            />
          )}
        </SourceControlRowActions>
      </SourceControlTreeRow>
    </SourceControlEntryContextMenu>
  )
}

export function ConflictBadge({ entry }: { entry: GitStatusEntry }): React.JSX.Element {
  const isUnresolvedConflict = entry.conflictStatus === 'unresolved'
  const label = isUnresolvedConflict
    ? translate('auto.components.right.sidebar.SourceControl.31f6d46278', 'Unresolved')
    : translate('auto.components.right.sidebar.SourceControl.2c417432b7', 'Resolved locally')
  const conflictKindLabel = entry.conflictKind
    ? getLocalizedConflictKindLabel(entry.conflictKind)
    : null
  const Icon = isUnresolvedConflict ? TriangleAlert : CircleCheck
  const badge = (
    <span
      role="status"
      aria-label={
        conflictKindLabel
          ? translate(
              'auto.components.right.sidebar.SourceControl.d206117f90',
              '{{value0}} conflict ({{value1}})',
              { value0: label, value1: conflictKindLabel }
            )
          : translate(
              'auto.components.right.sidebar.SourceControl.05838cfdeb',
              '{{value0}} conflict',
              { value0: label }
            )
      }
      className={cn(
        'inline-flex shrink-0 items-center gap-1 px-2 py-0.5 text-[10px] font-semibold',
        isUnresolvedConflict
          ? 'bg-destructive/12 text-destructive'
          : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
      )}
    >
      <Icon className="size-3" />
      <span>{label}</span>
    </span>
  )

  if (isUnresolvedConflict) {
    return badge
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={badge} />
        <TooltipContent side="left" sideOffset={6}>
          {translate(
            'auto.components.right.sidebar.SourceControl.03194cfff4',
            'Local session state derived from a conflict you opened here.'
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
