import type { ComponentProps, ReactNode } from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  ArrowsInLineVertical as CollapseSections,
  ArrowsOutLineVertical as ExpandSections,
  Columns as SideBySideColumns,
  TextAlignLeft as WrapText
} from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { DiffCodeView } from '../diff-code-view/view'
import type { DiffSection } from '../diff-section/types'
import type { OpenFile } from '../state'
import { getCombinedDiffCommitMessageBody } from './commit-message'

type CombinedDiffSurfaceProps = {
  branchBaseRef?: string
  codeViewProps: ComponentProps<typeof DiffCodeView>
  commitCompare: NonNullable<OpenFile['commitCompare']> | null
  file: OpenFile
  isAllMode: boolean
  isBranchMode: boolean
  isCommitMode: boolean
  isWordWrapEnabled: boolean
  notesControl: ReactNode
  onOpenAlternateDiff: () => void
  onOpenConflictReview: () => void
  onSetAllSectionsCollapsed: (collapsed: boolean) => void
  onToggleSideBySide: () => void
  onToggleWordWrap: () => void
  sections: DiffSection[]
  sideBySide: boolean
}

export function CombinedDiffSurface({
  branchBaseRef,
  codeViewProps,
  commitCompare,
  file,
  isAllMode,
  isBranchMode,
  isCommitMode,
  isWordWrapEnabled,
  notesControl,
  onOpenAlternateDiff,
  onOpenConflictReview,
  onSetAllSectionsCollapsed,
  onToggleSideBySide,
  onToggleWordWrap,
  sections,
  sideBySide
}: CombinedDiffSurfaceProps): React.JSX.Element {
  const commitHeader = commitCompare ? <CommitHeader commitCompare={commitCompare} /> : null

  if (sections.length === 0 && (file.skippedConflicts?.length ?? 0) > 0) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {commitHeader}
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div className="max-w-md space-y-3">
            <div className="text-foreground text-sm font-medium">
              {translate(
                'auto.components.editor.CombinedDiffViewer.820ec01f24',
                'Conflicted files are reviewed separately'
              )}
            </div>
            <div className="text-muted-foreground text-xs">
              {translate(
                'auto.components.editor.CombinedDiffViewer.eb5f40e49c',
                'This diff view excludes unresolved conflicts because the normal two-way diff pipeline is not conflict-safe.'
              )}
            </div>
            <div className="text-muted-foreground text-xs">
              {file.skippedConflicts?.map((entry) => entry.path).join(', ')}
            </div>
            <div className="flex justify-center">
              <Button type="button" size="sm" variant="outline" onClick={onOpenConflictReview}>
                {translate(
                  'auto.components.editor.CombinedDiffViewer.39f8007549',
                  'Review conflicts'
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (sections.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {commitHeader}
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
          {translate(
            'auto.components.editor.CombinedDiffViewer.fd8892b120',
            'No changes to display'
          )}
        </div>
      </div>
    )
  }

  const allSectionsCollapsed = sections.every((section) => section.collapsed)
  const collapseAllLabel = allSectionsCollapsed
    ? translate('auto.components.editor.CombinedDiffViewer.19c45cfdc0', 'Expand All')
    : translate('auto.components.editor.CombinedDiffViewer.ea08dae15b', 'Collapse All')
  const diffLayoutLabel = sideBySide
    ? translate('auto.components.editor.combined.diff.viewer.604195710f', 'Show inline diff')
    : translate('auto.components.editor.combined.diff.viewer.5b6c3f9596', 'Show side-by-side diff')
  const diffWordWrapLabel = isWordWrapEnabled
    ? translate('auto.components.editor.combined.diff.viewer.7b47fe46c8', 'Turn word wrap off')
    : translate('auto.components.editor.combined.diff.viewer.820b3e0422', 'Turn word wrap on')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border bg-background/50 flex shrink-0 items-center justify-between gap-3 border-b px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground truncate text-xs">
            {sections.length}{' '}
            {translate('auto.components.editor.CombinedDiffViewer.7e7ca60816', 'changed files')}
            {(isAllMode || isBranchMode) && branchBaseRef
              ? translate(
                  'auto.components.editor.CombinedDiffViewer.6094135eec',
                  ' vs {{value0}}',
                  {
                    value0: branchBaseRef
                  }
                )
              : ''}
            {isCommitMode && commitCompare
              ? translate(
                  'auto.components.editor.CombinedDiffViewer.724a13568d',
                  ' in {{value0}}',
                  {
                    value0: commitCompare.compareRef
                  }
                )
              : ''}
          </span>
          {notesControl}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {file.combinedAlternate ? (
            <Button
              variant="quiet"
              size="xs"
              className="h-auto border-0 p-0"
              onClick={onOpenAlternateDiff}
            >
              {file.combinedAlternate.source === 'combined-branch'
                ? translate(
                    'auto.components.editor.CombinedDiffViewer.3d909843bb',
                    'Open Branch Diff'
                  )
                : translate(
                    'auto.components.editor.CombinedDiffViewer.982d14bfa5',
                    'Open All Changes'
                  )}
            </Button>
          ) : null}
          <ToolbarButton
            label={collapseAllLabel}
            onClick={() => onSetAllSectionsCollapsed(!allSectionsCollapsed)}
            icon={
              allSectionsCollapsed ? (
                <ExpandSections className="size-3.5" />
              ) : (
                <CollapseSections className="size-3.5" />
              )
            }
          />
          <ToolbarButton
            label={diffLayoutLabel}
            isActive={sideBySide}
            onClick={onToggleSideBySide}
            icon={<SideBySideColumns className="size-3.5" />}
          />
          <ToolbarButton
            label={diffWordWrapLabel}
            isActive={isWordWrapEnabled}
            onClick={onToggleWordWrap}
            icon={<WrapText className="size-3.5" />}
          />
        </div>
      </div>
      {commitHeader}
      {file.skippedConflicts?.length ? (
        <SkippedConflictNotice
          count={file.skippedConflicts.length}
          onOpenConflictReview={onOpenConflictReview}
        />
      ) : null}
      <div className="relative min-h-0 min-w-0 flex-1">
        <DiffCodeView {...codeViewProps} />
      </div>
    </div>
  )
}

function CommitHeader({
  commitCompare
}: {
  commitCompare: NonNullable<OpenFile['commitCompare']>
}): React.JSX.Element {
  const body = getCombinedDiffCommitMessageBody(commitCompare.message, commitCompare.subject)
  return (
    <div className="border-border bg-background border-b px-4 py-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          {commitCompare.subject ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <div
                    className="text-foreground truncate text-sm font-semibold"
                    title={commitCompare.subject}
                  >
                    {commitCompare.subject}
                  </div>
                }
              />
              <TooltipContent side="bottom" sideOffset={6} className="max-w-96">
                {commitCompare.subject}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {body ? (
            <div className="text-muted-foreground scrollbar-sleek mt-1 max-h-24 overflow-auto text-xs leading-5 whitespace-pre-wrap">
              {body}
            </div>
          ) : null}
        </div>
        <span className="text-muted-foreground shrink-0 font-mono text-[11px] leading-5">
          {commitCompare.compareRef}
        </span>
      </div>
    </div>
  )
}

type ToolbarButtonProps = {
  icon: ReactNode
  isActive?: boolean
  label: string
  onClick: () => void
}

function ToolbarButton({ icon, isActive, label, onClick }: ToolbarButtonProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex shrink-0">
            <Button
              type="button"
              variant="quiet"
              size="icon-xs"
              className={cn(isActive ? 'bg-accent' : '')}
              aria-label={label}
              aria-pressed={isActive}
              title={label}
              onClick={onClick}
            >
              {icon}
            </Button>
          </span>
        }
      />
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function SkippedConflictNotice({
  count,
  onOpenConflictReview
}: {
  count: number
  onOpenConflictReview: () => void
}): React.JSX.Element {
  return (
    <div className="border-border/60 bg-muted/20 mx-4 mt-3 rounded-md border px-3 py-2 text-xs">
      <div className="text-foreground font-medium">
        {translate(
          'auto.components.editor.CombinedDiffViewer.820ec01f24',
          'Conflicted files are reviewed separately'
        )}
      </div>
      <div className="text-muted-foreground mt-1">
        {count}{' '}
        {translate('auto.components.editor.CombinedDiffViewer.689b99f8ad', 'unresolved conflict')}
        {count === 1 ? '' : 's'}{' '}
        {translate(
          'auto.components.editor.CombinedDiffViewer.39e73e7181',
          'were excluded from this diff view.'
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={onOpenConflictReview}
        >
          {translate('auto.components.editor.CombinedDiffViewer.39f8007549', 'Review conflicts')}
        </Button>
      </div>
    </div>
  )
}
