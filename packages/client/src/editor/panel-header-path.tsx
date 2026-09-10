import { useEffect, useRef, useState } from 'react'
import type { OpenFile } from '~renderer/editor/state'
import { translate } from '~renderer/i18n/i18n'
import { Copy, Eye, Pencil, ArrowSquareOut as ExternalLink } from '~renderer/icons/hugeicons'
import { useShortcutLabel } from '~renderer/keyboard-input/use-shortcut-label'
import { shellClient } from '~renderer/runtime/shell-client'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger
} from '~renderer/ui/context-menu'
import { Input } from '~renderer/ui/input'

import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from '../tab-bar/sortable-tab'
import { getEditorHeaderCopyState } from './header'
import { useEditorHeaderFileRename } from './header-file-rename'

const isMac = navigator.userAgent.includes('Mac')
const isLinux = navigator.userAgent.includes('Linux')

/** Platform-appropriate label: macOS -> Finder, Windows -> File Explorer, Linux -> Files */
const revealLabel = isMac
  ? 'Reveal in Finder'
  : isLinux
    ? 'Open Containing Folder'
    : 'Reveal in File Explorer'

type EditorPanelHeaderPathProps = {
  activeFile: OpenFile
  copiedPathVisible: boolean
  canShowMarkdownPreview: boolean
  onCopyPath: () => void
  onOpenMarkdownPreview: () => void
  onOpenContainingFolder: () => void
}

export function EditorPanelHeaderPath({
  activeFile,
  copiedPathVisible,
  canShowMarkdownPreview,
  onCopyPath,
  onOpenMarkdownPreview,
  onOpenContainingFolder
}: EditorPanelHeaderPathProps): React.JSX.Element {
  const [pathMenuOpen, setPathMenuOpen] = useState(false)
  const skipMenuFocusRestoreRef = useRef(false)
  const headerCopyState = getEditorHeaderCopyState(activeFile)
  const canCopyHeaderPath = headerCopyState.copyText !== null
  const isVirtualEditorTab = activeFile.mode === 'check-details'
  const markdownPreviewShortcutLabel = useShortcutLabel('editor.markdownPreview')
  const {
    canRename,
    currentFileName,
    isRenaming,
    renameInputRef,
    openRenameInput,
    commitRename,
    cancelRename
  } = useEditorHeaderFileRename(activeFile)

  useEffect(() => {
    const closeMenu = (): void => setPathMenuOpen(false)
    window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
    return () => window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
  }, [])

  return (
    <ContextMenu open={pathMenuOpen} onOpenChange={setPathMenuOpen}>
      <ContextMenuTrigger
        onContextMenu={() => {
          window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
        }}
        render={<div className="flex min-w-0 flex-1 items-center gap-2" />}
      >
        {isRenaming ? (
          <Input
            ref={renameInputRef}
            data-editor-header-rename-input="true"
            aria-label={translate(
              'auto.components.editor.EditorPanelHeader.1bb1e226ec',
              'Rename file {{value0}}',
              { value0: currentFileName }
            )}
            defaultValue={currentFileName}
            // Why: the header is narrow in floating mode; this keeps the
            // edit field aligned with the path label without growing chrome.
            className="bg-input/40 text-foreground h-6 w-[16ch] max-w-full min-w-[104px] rounded-sm px-1.5 py-0 font-mono text-xs md:text-xs"
            spellCheck={false}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.stopPropagation()
                commitRename()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                cancelRename()
              }
            }}
            onBlur={commitRename}
          />
        ) : (
          <Button
            variant="quiet"
            size="xs"
            type="button"
            className={cn(
              'h-auto justify-start gap-0 font-normal block min-w-0 max-w-full flex-[0_1_auto] overflow-hidden border-0 bg-transparent p-0 text-left font-mono leading-[1.2] text-ellipsis disabled:cursor-default disabled:text-muted-foreground disabled:hover:text-muted-foreground'
            )}
            onClick={canCopyHeaderPath ? onCopyPath : undefined}
            disabled={!canCopyHeaderPath}
            title={headerCopyState.pathTitle}
          >
            {headerCopyState.pathLabel}
          </Button>
        )}
        <span
          className={cn(
            'pointer-events-none translate-y-0.5 shrink-0 bg-[color-mix(in_srgb,var(--accent)_72%,transparent)] px-1.5 py-0.5 text-[11px] leading-[1.2] whitespace-nowrap text-foreground opacity-0 transition-[opacity,transform] duration-[120ms] ease-[ease]',
            copiedPathVisible && 'translate-y-0 opacity-100'
          )}
          aria-live="polite"
        >
          {headerCopyState.copyToastLabel}
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent
        className="w-56"
        finalFocus={() => {
          if (!skipMenuFocusRestoreRef.current) {
            return
          }
          skipMenuFocusRestoreRef.current = false
          // Return false to suppress the default focus restore.
          return false
        }}
      >
        <ContextMenuItem
          disabled={!canRename}
          onClick={() => {
            skipMenuFocusRestoreRef.current = true
            openRenameInput()
          }}
        >
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          {translate('auto.components.editor.EditorPanelHeader.84cdc0794b', 'Rename')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        {!isVirtualEditorTab && (
          <>
            <ContextMenuItem
              onClick={() => {
                void shellClient.ui.writeClipboardText(activeFile.filePath)
              }}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              {translate('auto.components.editor.EditorPanelHeader.7c08a1f990', 'Copy Path')}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                void shellClient.ui.writeClipboardText(activeFile.relativePath)
              }}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              {translate(
                'auto.components.editor.EditorPanelHeader.269ce4842b',
                'Copy Relative Path'
              )}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        {canShowMarkdownPreview && (
          <ContextMenuItem onClick={onOpenMarkdownPreview}>
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            {translate(
              'auto.components.editor.EditorPanelHeader.4157f3cbf3',
              'Open Markdown Preview'
            )}
            <ContextMenuShortcut>{markdownPreviewShortcutLabel}</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        {canShowMarkdownPreview && <ContextMenuSeparator />}
        {!isVirtualEditorTab && (
          <ContextMenuItem onClick={onOpenContainingFolder}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            {revealLabel}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
