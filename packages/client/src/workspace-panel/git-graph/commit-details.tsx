import type { GitBranchChangeEntry } from '@yiru/protocol/git/branch-compare-types'
import type { GitHistoryItem } from '@yiru/protocol/git/history-types'
import type { GitFileStatus } from '@yiru/protocol/git/status-types'
import React, { useEffect, useState } from 'react'
import { getFileTypeIcon } from '~renderer/file-presentation/icons'
import { translate } from '~renderer/i18n/i18n'
import { ArrowUpRight } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { basename, dirname } from '~renderer/path'
import { Button } from '~renderer/ui/button'
import { ScrollArea } from '~renderer/ui/scroll-area'

import { DiffLineCounts } from '../source-control/entry-details'
import type { SourceControlRowOpenEvent } from '../source-control/split-open'
import {
  toPermanentSourceControlRowOpenEvent,
  toSourceControlRowOpenEvent
} from '../source-control/split-open'
import { STATUS_COLORS, STATUS_LABELS } from '../status-display'
import { formatGitGraphFullDate, formatGitGraphMessageBody } from './format'
import { GIT_GRAPH_EXPAND_HEIGHT } from './layout'

type GitGraphCommitFilesState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; entries: GitBranchChangeEntry[] }

function CommitFileRow({
  entry,
  onOpen
}: {
  entry: GitBranchChangeEntry
  onOpen: (entry: GitBranchChangeEntry, event: SourceControlRowOpenEvent) => void
}): React.JSX.Element {
  const status = entry.status as GitFileStatus
  const FileIcon = getFileTypeIcon(entry.path)
  const fileName = basename(entry.path)
  const parentDir = dirname(entry.path)
  const dirPath = parentDir === '.' ? '' : parentDir

  return (
    <Button
      variant="ghost"
      size="xs"
      type="button"
      className="hover:bg-accent/40 focus-visible:bg-accent/40 flex h-auto w-full min-w-0 justify-start border-0 py-1 pr-3 pl-2 text-left font-normal whitespace-normal transition-colors"
      title={entry.path}
      onClick={(event) => onOpen(entry, toSourceControlRowOpenEvent(event))}
      onDoubleClick={(event) => onOpen(entry, toPermanentSourceControlRowOpenEvent(event))}
    >
      {React.createElement(FileIcon, {
        className: 'size-3.5 shrink-0',
        style: { color: STATUS_COLORS[status] }
      })}
      <span className="min-w-0 flex-1 truncate">
        <span className="text-foreground">{fileName}</span>
        {dirPath && <span className="text-muted-foreground ml-1.5 text-[11px]">{dirPath}</span>}
      </span>
      <DiffLineCounts added={entry.added} removed={entry.removed} />
      <span
        className="w-4 shrink-0 text-center text-[10px] font-bold"
        style={{ color: STATUS_COLORS[status] }}
      >
        {STATUS_LABELS[status]}
      </span>
    </Button>
  )
}

export function GitGraphCommitDetails({
  item,
  graphColumnWidth,
  loadCommitFiles,
  onOpenFile,
  onOpenAllChanges,
  onSelectParent
}: {
  item: GitHistoryItem
  // Why: the graph SVG keeps drawing its lanes straight through the gap this
  // block occupies, so the block starts after the lanes instead of under them.
  graphColumnWidth: number
  loadCommitFiles: (item: GitHistoryItem) => Promise<GitBranchChangeEntry[]>
  onOpenFile: (entry: GitBranchChangeEntry, event?: SourceControlRowOpenEvent) => void
  onOpenAllChanges: () => void
  onSelectParent: (parentId: string) => void
}): React.JSX.Element {
  const [loadedState, setLoadedState] = useState<{
    commitId: string
    state: GitGraphCommitFilesState
  } | null>(null)
  const state =
    loadedState?.commitId === item.id ? loadedState.state : { status: 'loading' as const }
  const messageBody = formatGitGraphMessageBody(item.subject, item.message)

  useEffect(() => {
    let cancelled = false
    loadCommitFiles(item)
      .then((entries) => {
        if (!cancelled) {
          setLoadedState({ commitId: item.id, state: { status: 'ready', entries } })
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadedState({
            commitId: item.id,
            state: {
              status: 'error',
              error:
                error instanceof Error
                  ? error.message
                  : translate(
                      'auto.components.workspace-panel.git-graph.CommitDetails.a1b2c3d4e5',
                      'Failed to load commit files'
                    )
            }
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [item, loadCommitFiles])

  return (
    // Why: fixed to GIT_GRAPH_EXPAND_HEIGHT so this block's rendered height
    // always matches the row-gap the graph SVG opened for it (buildGitGraphLayout's
    // rowGap.height) — content taller than that scrolls internally instead of
    // pushing the next row further than the graph lines expect.
    <div className="flex items-stretch" style={{ height: GIT_GRAPH_EXPAND_HEIGHT }}>
      <div className="shrink-0" style={{ width: graphColumnWidth }} aria-hidden="true" />
      <div className="border-border/60 bg-muted/20 flex min-w-0 flex-1 flex-col border-t text-[11px]">
        <ScrollArea className="min-h-0 flex-1" viewportClassName="space-y-2 px-3 py-2">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1">
            <dt className="text-muted-foreground">
              {translate(
                'auto.components.workspace-panel.git-graph.CommitDetails.b2c3d4e5f6',
                'Hash'
              )}
            </dt>
            <dd className="text-foreground truncate font-mono">{item.id}</dd>
            {item.parentIds.length > 0 && (
              <>
                <dt className="text-muted-foreground">
                  {translate(
                    'auto.components.workspace-panel.git-graph.CommitDetails.c3d4e5f6a7',
                    'Parents'
                  )}
                </dt>
                <dd className="flex flex-wrap gap-x-2 gap-y-0.5 font-mono">
                  {item.parentIds.map((parentId) => (
                    <Button
                      key={parentId}
                      type="button"
                      variant="link"
                      size="xs"
                      className="h-auto p-0 font-mono"
                      onClick={() => onSelectParent(parentId)}
                    >
                      {parentId.slice(0, 8)}
                    </Button>
                  ))}
                </dd>
              </>
            )}
            {item.author && (
              <>
                <dt className="text-muted-foreground">
                  {translate(
                    'auto.components.workspace-panel.git-graph.CommitDetails.d4e5f6a7b8',
                    'Author'
                  )}
                </dt>
                <dd className="text-foreground truncate">
                  {item.author}
                  {item.authorEmail ? ` <${item.authorEmail}>` : ''}
                  {item.timestamp ? ` · ${formatGitGraphFullDate(item.timestamp)}` : ''}
                </dd>
              </>
            )}
          </dl>
          {messageBody && (
            <p className="text-foreground border-border/60 border-t pt-2 whitespace-pre-wrap">
              {messageBody}
            </p>
          )}
          <div className="border-border/60 -mx-3 border-t">
            {state.status === 'loading' && (
              <div className="text-muted-foreground flex items-center gap-2 px-3 py-1.5">
                <LoadingIndicator className="size-3" />
                <span>
                  {translate(
                    'auto.components.workspace-panel.git-graph.CommitDetails.e5f6a7b8c9',
                    'Loading files…'
                  )}
                </span>
              </div>
            )}
            {state.status === 'error' && (
              <div className="text-destructive px-3 py-1.5">{state.error}</div>
            )}
            {state.status === 'ready' && state.entries.length === 0 && (
              <div className="text-muted-foreground px-3 py-1.5">
                {translate(
                  'auto.components.workspace-panel.git-graph.CommitDetails.f6a7b8c9d0',
                  'No file changes in this commit'
                )}
              </div>
            )}
            {state.status === 'ready' && state.entries.length > 0 && (
              <>
                {state.entries.map((entry) => (
                  <CommitFileRow key={entry.path} entry={entry} onOpen={onOpenFile} />
                ))}
                <Button
                  variant="quiet"
                  size="xs"
                  type="button"
                  className="flex h-auto w-full justify-start border-0 py-1 pl-2 text-left text-[11px] font-normal whitespace-normal"
                  onClick={onOpenAllChanges}
                >
                  <ArrowUpRight className="size-3 shrink-0" />
                  <span>
                    {translate(
                      'auto.components.workspace-panel.git-graph.CommitDetails.a7b8c9d0e1',
                      'Open all changes together'
                    )}
                  </span>
                </Button>
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
