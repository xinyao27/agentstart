import type { GitStatusEntry } from '@agentstart/protocol/git/status-types'
import { useRef } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Trash, ArrowCounterClockwise as Undo2 } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'

import type { DiscardAllArea } from '../discard-all-sequence'
import {
  getDiscardAreaConfirmationCopy,
  getDiscardEntryConfirmationCopy
} from './discard-confirmation'

export type PendingDiscardConfirmation =
  | { kind: 'entry'; entry: GitStatusEntry }
  | { kind: 'area'; area: DiscardAllArea; paths: readonly string[] }

export function SourceControlDiscardDialog({
  pendingDiscard,
  onCancel,
  onConfirm
}: {
  pendingDiscard: PendingDiscardConfirmation | null
  onCancel: () => void
  onConfirm: () => void
}): React.JSX.Element {
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const pendingDiscardCopy = (() => {
    if (!pendingDiscard) {
      return null
    }
    if (pendingDiscard.kind === 'entry') {
      return getDiscardEntryConfirmationCopy(pendingDiscard.entry)
    }
    return getDiscardAreaConfirmationCopy(pendingDiscard.area, pendingDiscard.paths.length)
  })()
  const pendingDiscardDeletes = pendingDiscardCopy?.confirmLabel.startsWith('Delete') === true
  const PendingDiscardIcon = pendingDiscardDeletes ? Trash : Undo2

  return (
    <Dialog
      open={pendingDiscard !== null}
      onOpenChange={(open) => {
        if (!open) {
          onCancel()
        }
      }}
    >
      <DialogContent
        className="max-w-md"
        // Why: focus the destructive confirm button on open so Enter confirms
        // rather than the default Cancel focus. See focusDiscardDialogConfirmButton.
        initialFocus={confirmButtonRef}
      >
        <DialogHeader>
          <DialogTitle className="text-sm">
            {pendingDiscardCopy?.title ??
              translate(
                'auto.components.right.sidebar.source.control.discard.dialog.1551c14668',
                'Discard changes?'
              )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {pendingDiscardCopy?.description ??
              translate(
                'auto.components.right.sidebar.source.control.discard.dialog.0d2d88cba5',
                'This cannot be undone.'
              )}
          </DialogDescription>
        </DialogHeader>
        {pendingDiscard?.kind === 'area' ? (
          <div className="border-border/70 bg-muted/35 text-muted-foreground rounded-md border px-3 py-2 text-xs">
            {pendingDiscard.paths.length}{' '}
            {pendingDiscard.paths.length === 1
              ? translate(
                  'auto.components.right.sidebar.source.control.discard.dialog.e7611dca35',
                  'file'
                )
              : translate(
                  'auto.components.right.sidebar.source.control.discard.dialog.42f89dd030',
                  'files'
                )}
          </div>
        ) : pendingDiscard?.kind === 'entry' ? (
          <div className="border-border/70 bg-muted/35 rounded-md border px-3 py-2 text-xs">
            <div className="text-foreground font-medium break-all">{pendingDiscard.entry.path}</div>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {translate(
              'auto.components.right.sidebar.source.control.discard.dialog.3bc61dc989',
              'Cancel'
            )}
          </Button>
          <Button
            ref={confirmButtonRef}
            type="button"
            variant="destructive"
            autoFocus
            onClick={onConfirm}
          >
            <PendingDiscardIcon className="size-4" />
            {pendingDiscardCopy?.confirmLabel ??
              translate(
                'auto.components.right.sidebar.source.control.discard.dialog.15efa778e3',
                'Discard'
              )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
