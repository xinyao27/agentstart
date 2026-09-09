import type { DiffComment } from '@yiru/protocol/git/diff-review'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import {
  Check,
  Copy,
  Chat as MessageSquare,
  Sparkle as Sparkles,
  Trash as Trash2
} from '~renderer/icons/hugeicons'
import { shellClient } from '~renderer/runtime/shell-client'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '~renderer/ui/popover'

import { getDiffCommentLineLabel } from '../diff-comment-compat'
import { formatDiffComments } from '../diff-comments-format'
import { DiffNotesSendMenu } from '../diff-notes-send-menu'

type CombinedDiffNotesControlProps = {
  comments: DiffComment[]
  groupId: string
  worktreeId: string
}

export function CombinedDiffNotesControl({
  comments,
  groupId,
  worktreeId
}: CombinedDiffNotesControlProps): React.JSX.Element {
  const clearDiffComments = useAppStore((state) => state.clearDiffComments)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const isMountedRef = useRef(false)
  const copiedResetTimerRef = useRef<number | null>(null)
  const count = comments.length
  const previewComments = [...comments]
    .sort((a, b) => a.filePath.localeCompare(b.filePath) || a.lineNumber - b.lineNumber)
    .slice(0, 4)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (copiedResetTimerRef.current !== null) {
        window.clearTimeout(copiedResetTimerRef.current)
      }
    }
  }, [])

  const handleCopy = async (): Promise<void> => {
    if (count === 0) {
      return
    }
    try {
      await shellClient.ui.writeClipboardText(formatDiffComments(comments))
      if (!isMountedRef.current) {
        return
      }
      if (copiedResetTimerRef.current !== null) {
        window.clearTimeout(copiedResetTimerRef.current)
      }
      setIsCopied(true)
      copiedResetTimerRef.current = window.setTimeout(() => {
        setIsCopied(false)
        copiedResetTimerRef.current = null
      }, 1500)
    } catch {
      // Why: clipboard writes can fail while the app is not focused; notes stay usable.
    }
  }

  const handleClear = async (): Promise<void> => {
    if (count === 0 || isClearing) {
      return
    }
    setIsClearing(true)
    try {
      const didClear = await clearDiffComments(worktreeId)
      if (!isMountedRef.current) {
        return
      }
      if (didClear) {
        setIsDialogOpen(false)
      } else {
        toast.error(
          translate(
            'auto.components.editor.CombinedDiffViewer.45cf23b418',
            'Failed to clear notes.'
          )
        )
      }
    } finally {
      if (isMountedRef.current) {
        setIsClearing(false)
      }
    }
  }

  return (
    <>
      {count > 0 ? (
        <div className="border-border/70 bg-muted/40 ml-1 flex shrink-0 items-center overflow-hidden border">
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="xs"
                  type="button"
                  className="text-foreground/80 hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground border-0 pr-1.5 pl-2 text-[11px] leading-none transition-colors"
                  aria-label={translate(
                    'auto.components.editor.CombinedDiffViewer.8f68ad9ca9',
                    'Show {{value0}} AI {{value1}}',
                    { value0: count, value1: count === 1 ? 'note' : 'notes' }
                  )}
                >
                  <Sparkles className="text-primary size-3" />
                  <span>
                    {translate('auto.components.editor.CombinedDiffViewer.bb84b4c374', 'AI notes')}
                  </span>
                  <span className="bg-background/80 text-muted-foreground px-1 text-[10px] tabular-nums">
                    {count}
                  </span>
                </Button>
              }
            />
            <PopoverContent align="start" side="bottom" sideOffset={6} className="w-80 p-0">
              <DiffNotesPreview
                comments={previewComments}
                totalCount={count}
                isCopied={isCopied}
                onCopy={() => void handleCopy()}
                onClear={() => setIsDialogOpen(true)}
              />
            </PopoverContent>
          </Popover>
          <DiffNotesSendMenu
            worktreeId={worktreeId}
            groupId={groupId}
            comments={comments}
            actionLabel="Send"
            triggerClassName="h-6 gap-1 border-l border-border/70 px-2 text-[11px] font-medium leading-none text-foreground/80 hover:bg-accent hover:text-foreground"
            iconClassName="size-3"
          />
        </div>
      ) : null}
      <Dialog
        open={isDialogOpen && (count > 0 || isClearing)}
        onOpenChange={(open) => {
          if (!open && !isClearing) {
            setIsDialogOpen(false)
          } else if (open) {
            setIsDialogOpen(true)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {translate('auto.components.editor.CombinedDiffViewer.948a5fd6c8', 'Clear Notes')}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {translate('auto.components.editor.CombinedDiffViewer.84898c548d', 'Clear')}
              {count}{' '}
              {count === 1
                ? translate('auto.components.editor.CombinedDiffViewer.8ab3248fd8', 'note')
                : translate('auto.components.editor.CombinedDiffViewer.0fb870a0fe', 'notes')}{' '}
              {translate(
                'auto.components.editor.CombinedDiffViewer.80a286d8f5',
                'from this worktree?'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isClearing}
            >
              {translate('auto.components.editor.CombinedDiffViewer.0f806a2ab1', 'Cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleClear()}
              disabled={isClearing || count === 0}
            >
              <Trash2 className="size-4" />
              {translate('auto.components.editor.CombinedDiffViewer.948a5fd6c8', 'Clear Notes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

type DiffNotesPreviewProps = {
  comments: DiffComment[]
  isCopied: boolean
  onClear: () => void
  onCopy: () => void
  totalCount: number
}

function DiffNotesPreview({
  comments,
  isCopied,
  onClear,
  onCopy,
  totalCount
}: DiffNotesPreviewProps): React.JSX.Element {
  const remainingCount = Math.max(0, totalCount - comments.length)

  return (
    <div className="text-xs">
      <div className="border-border/60 flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="text-foreground flex min-w-0 items-center gap-1.5 font-medium">
          <MessageSquare className="text-muted-foreground size-3.5 shrink-0" />
          <span>
            {translate('auto.components.editor.CombinedDiffViewer.bb84b4c374', 'AI notes')}
          </span>
          <span className="text-muted-foreground text-[11px] font-normal tabular-nums">
            {totalCount}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="quiet" size="xs" className="h-6" onClick={onCopy}>
            {isCopied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {translate('auto.components.editor.CombinedDiffViewer.88b70d0ef5', 'Copy')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-muted-foreground hover:text-destructive h-6"
            onClick={onClear}
          >
            <Trash2 className="size-3" />
            {translate('auto.components.editor.CombinedDiffViewer.84898c548d', 'Clear')}
          </Button>
        </div>
      </div>
      <div className="scrollbar-sleek max-h-72 overflow-y-auto p-2">
        {comments.map((comment) => (
          <div key={comment.id} className="hover:bg-accent/50 px-2 py-1.5">
            <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] leading-none">
              <span className="min-w-0 flex-1 truncate font-mono">{comment.filePath}</span>
              {comment.sentAt ? (
                <span className="bg-muted shrink-0 px-1 py-0.5 text-[10px] leading-none">
                  {translate('auto.components.editor.CombinedDiffViewer.1da745c551', 'Sent')}
                </span>
              ) : null}
              <span className="shrink-0 tabular-nums">
                {getDiffCommentLineLabel(comment, true)}
              </span>
            </div>
            <div className="text-foreground mt-1 max-h-10 overflow-hidden text-[12px] leading-snug break-words whitespace-pre-wrap">
              {comment.body}
            </div>
          </div>
        ))}
        {remainingCount > 0 ? (
          <div className="text-muted-foreground px-2 py-1 text-[11px]">
            {remainingCount}{' '}
            {translate('auto.components.editor.CombinedDiffViewer.e3b9a6ce02', 'more')}
            {remainingCount === 1
              ? translate('auto.components.editor.CombinedDiffViewer.8ab3248fd8', 'note')
              : translate('auto.components.editor.CombinedDiffViewer.0fb870a0fe', 'notes')}{' '}
            {translate('auto.components.editor.CombinedDiffViewer.35cc27aeb2', 'in Source Control')}
          </div>
        ) : null}
      </div>
    </div>
  )
}
