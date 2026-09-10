import { selectWorktreeDiffCommentsOrEmpty } from '~renderer/diff-comments/worktree-selector'
import type { OpenFile } from '~renderer/editor/state'
import { translate } from '~renderer/i18n/i18n'
import {
  Columns as Columns2,
  Eye,
  FileText,
  TreeStructure as ListTree,
  Rows as Rows2
} from '~renderer/icons/hugeicons'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { ButtonGroup } from '~renderer/ui/button-group'
import { cn } from '~renderer/ui/class-names'
import { Toggle } from '~renderer/ui/toggle'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~renderer/ui/tooltip'

import { DiffNotesSendMenu } from './diff-notes-send-menu'
import type { EditorHeaderOpenFileState } from './header'
import { EditorPanelHeaderPath } from './panel-header-path'
import { EditorPanelMarkdownActionsMenu } from './panel-markdown-actions-menu'
import EditorViewToggle, {
  CSV_VIEW_MODE_METADATA,
  NOTEBOOK_VIEW_MODE_METADATA
} from './view-toggle'
import type { EditorToggleValue } from './view-toggle'

type EditorPanelHeaderProps = {
  activeFile: OpenFile
  copiedPathVisible: boolean
  isSingleDiff: boolean
  isDiffSurface: boolean
  isMarkdown: boolean
  isCsv: boolean
  isNotebook: boolean
  hasEditorToggle: boolean
  availableEditorToggleModes: readonly EditorToggleValue[]
  effectiveToggleValue: EditorToggleValue
  canOpenPreviewToSide: boolean
  canShowMarkdownPreview: boolean
  canShowMarkdownTableOfContents: boolean
  isMarkdownTableOfContentsDisabled: boolean
  shouldShowMarkdownExportAction: boolean
  canExportMarkdownToPdf: boolean
  showMarkdownTableOfContents: boolean
  canShowMarkdownFrontmatterToggle: boolean
  markdownFrontmatterVisible: boolean
  sideBySide: boolean
  openFileState: EditorHeaderOpenFileState
  onCopyPath: () => void
  onOpenDiffTargetFile: (preferredMarkdownViewMode?: 'rich') => void
  onOpenPreviewToSide: () => void
  onOpenMarkdownPreview: () => void
  onOpenContainingFolder: () => void
  onToggleSideBySide: () => void
  onEditorToggleChange: (next: EditorToggleValue) => void
  onToggleMarkdownTableOfContents: () => void
  onToggleMarkdownFrontmatter: () => void
  onExportMarkdownToPdf: () => void
}

export function EditorPanelHeader({
  activeFile,
  copiedPathVisible,
  isSingleDiff,
  isDiffSurface,
  isMarkdown,
  isCsv,
  isNotebook,
  hasEditorToggle,
  availableEditorToggleModes,
  effectiveToggleValue,
  canOpenPreviewToSide,
  canShowMarkdownPreview,
  canShowMarkdownTableOfContents,
  isMarkdownTableOfContentsDisabled,
  shouldShowMarkdownExportAction,
  canExportMarkdownToPdf,
  showMarkdownTableOfContents,
  canShowMarkdownFrontmatterToggle,
  markdownFrontmatterVisible,
  sideBySide,
  openFileState,
  onCopyPath,
  onOpenDiffTargetFile,
  onOpenPreviewToSide,
  onOpenMarkdownPreview,
  onOpenContainingFolder,
  onToggleSideBySide,
  onEditorToggleChange,
  onToggleMarkdownTableOfContents,
  onToggleMarkdownFrontmatter,
  onExportMarkdownToPdf
}: EditorPanelHeaderProps): React.JSX.Element {
  const diffComments = useAppStore((s) =>
    selectWorktreeDiffCommentsOrEmpty(s, activeFile.worktreeId)
  )
  const activeGroupId = useAppStore((s) => s.activeGroupIdByWorktree[activeFile.worktreeId])
  const diffWordWrap = useAppStore((s) => s.settings?.diffWordWrap === true)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const fileDiffComments = (() =>
    diffComments.filter((comment) => comment.filePath === activeFile.relativePath))()

  return (
    <div className="bg-background flex min-h-9 shrink-0 items-center gap-1 border-b border-b-[color-mix(in_srgb,var(--border)_72%,transparent)] px-3.5 py-1.5">
      <EditorPanelHeaderPath
        activeFile={activeFile}
        copiedPathVisible={copiedPathVisible}
        canShowMarkdownPreview={canShowMarkdownPreview}
        onCopyPath={onCopyPath}
        onOpenMarkdownPreview={onOpenMarkdownPreview}
        onOpenContainingFolder={onOpenContainingFolder}
      />
      {canOpenPreviewToSide && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="quiet"
                  size="icon-xs"
                  className="size-6 shrink-0 [&_svg]:size-3.5"
                  onClick={onOpenPreviewToSide}
                  aria-label={translate(
                    'auto.components.editor.EditorPanelHeader.fb8331694e',
                    'Open Preview to the Side'
                  )}
                >
                  <Eye size={14} />
                </Button>
              }
            />
            <TooltipContent side="bottom" sideOffset={4}>
              {translate(
                'auto.components.editor.EditorPanelHeader.fb8331694e',
                'Open Preview to the Side'
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {isSingleDiff && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="quiet"
                  size="icon-xs"
                  className="size-6 shrink-0 [&_svg]:size-3.5"
                  onClick={() => onOpenDiffTargetFile(isMarkdown ? 'rich' : undefined)}
                  aria-label={translate(
                    'auto.components.editor.EditorPanelHeader.a10d9b8337',
                    'Open file'
                  )}
                  disabled={!openFileState.canOpen}
                >
                  <FileText size={14} />
                </Button>
              }
            />
            <TooltipContent side="bottom" sideOffset={4}>
              {openFileState.canOpen
                ? isMarkdown
                  ? translate(
                      'auto.components.editor.EditorPanelHeader.f0fd4174b5',
                      'Open file tab to use rich markdown editing'
                    )
                  : translate(
                      'auto.components.editor.EditorPanelHeader.9b80bbe1de',
                      'Open file tab'
                    )
                : translate(
                    'auto.components.editor.EditorPanelHeader.c98ce191da',
                    'This diff has no modified-side file to open'
                  )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {isSingleDiff && fileDiffComments.length > 0 && (
        <DiffNotesSendMenu
          worktreeId={activeFile.worktreeId}
          groupId={activeGroupId ?? activeFile.worktreeId}
          comments={diffComments}
          filePath={activeFile.relativePath}
          showFileScope
          triggerLabel="AI notes"
          triggerCount={fileDiffComments.length}
          triggerClassName="h-6 shrink-0 gap-1 border border-border bg-muted px-2 text-[11px] font-medium leading-none text-foreground/80 hover:bg-accent hover:text-foreground rounded-full"
          iconClassName="size-3"
        />
      )}
      {isDiffSurface && (
        // Why: the adjacent diff controls use the same tooltip timing, so they
        // share one provider instead of creating redundant Radix contexts.
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="quiet"
                  size="icon-xs"
                  className="size-6 shrink-0 [&_svg]:size-3.5"
                  onClick={onToggleSideBySide}
                >
                  {sideBySide ? <Rows2 size={14} /> : <Columns2 size={14} />}
                </Button>
              }
            />
            <TooltipContent side="bottom" sideOffset={4}>
              {sideBySide
                ? translate(
                    'auto.components.editor.EditorPanelHeader.94756f08ba',
                    'Switch to inline diff'
                  )
                : translate(
                    'auto.components.editor.EditorPanelHeader.e836faacfa',
                    'Switch to side-by-side diff'
                  )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {(hasEditorToggle ||
        canShowMarkdownTableOfContents ||
        isDiffSurface ||
        (isMarkdown && (shouldShowMarkdownExportAction || canShowMarkdownFrontmatterToggle))) && (
        // Why: view-mode, TOC, and More are one header chrome cluster; ButtonGroup
        // collapses their seams so none of the trailing controls float apart.
        <ButtonGroup className="h-[23px] shrink-0">
          {hasEditorToggle && (
            <EditorViewToggle
              value={effectiveToggleValue}
              modes={availableEditorToggleModes}
              onChange={onEditorToggleChange}
              metadataOverride={
                isCsv
                  ? CSV_VIEW_MODE_METADATA
                  : isNotebook
                    ? NOTEBOOK_VIEW_MODE_METADATA
                    : undefined
              }
            />
          )}
          {canShowMarkdownTableOfContents && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    // Why: match EditorViewToggle segment chrome (Toggle outline/sm +
                    // the same 23×24/px-2 recipe) so TOC reads as a fourth segment.
                    <Toggle
                      variant="outline"
                      size="sm"
                      pressed={showMarkdownTableOfContents}
                      onPressedChange={onToggleMarkdownTableOfContents}
                      disabled={isMarkdownTableOfContentsDisabled}
                      aria-label={translate(
                        'auto.components.editor.EditorPanelHeader.5447c4f68f',
                        'Table of Contents'
                      )}
                      className={cn(
                        'h-[23px] w-[30px] min-w-[30px] shrink-0 px-2 focus:z-10 focus-visible:z-10',
                        'data-pressed:border-foreground/20 data-pressed:bg-foreground/10 data-pressed:text-foreground data-pressed:hover:bg-foreground/15 data-pressed:hover:text-foreground'
                      )}
                    >
                      <ListTree className="size-3.5" />
                    </Toggle>
                  }
                />
                <TooltipContent side="bottom" sideOffset={4}>
                  {isMarkdownTableOfContentsDisabled
                    ? translate(
                        'auto.components.editor.EditorPanelHeader.146cb5473c',
                        'Table of Contents is available in rich or preview mode'
                      )
                    : translate(
                        'auto.components.editor.EditorPanelHeader.5447c4f68f',
                        'Table of Contents'
                      )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <EditorPanelMarkdownActionsMenu
            isMarkdown={isMarkdown}
            isDiffSurface={isDiffSurface}
            diffWordWrap={diffWordWrap}
            shouldShowMarkdownExportAction={shouldShowMarkdownExportAction}
            canExportMarkdownToPdf={canExportMarkdownToPdf}
            canShowMarkdownFrontmatterToggle={canShowMarkdownFrontmatterToggle}
            markdownFrontmatterVisible={markdownFrontmatterVisible}
            onToggleDiffWordWrap={() => void updateSettings({ diffWordWrap: !diffWordWrap })}
            onToggleMarkdownFrontmatter={onToggleMarkdownFrontmatter}
            onExportMarkdownToPdf={onExportMarkdownToPdf}
          />
        </ButtonGroup>
      )}
    </div>
  )
}
