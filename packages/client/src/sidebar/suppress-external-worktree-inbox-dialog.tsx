import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Button } from '~renderer/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'

type SuppressExternalWorktreeInboxDialogProps = {
  open: boolean
  repoDisplayName: string
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  onOpenRecovery: () => void
}

export default function SuppressExternalWorktreeInboxDialog({
  open,
  repoDisplayName,
  pending,
  onOpenChange,
  onConfirm,
  onOpenRecovery
}: SuppressExternalWorktreeInboxDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.sidebar.SuppressExternalWorktreeInboxDialog.a4c2d8f1b0',
              'Hide external worktrees?'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.sidebar.SuppressExternalWorktreeInboxDialog.6e91b3c4d2',
              'External worktrees will not be shown in the sidebar or this list anymore for {{value0}}, including ones created later.',
              { value0: repoDisplayName }
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="border-border bg-muted/30 text-muted-foreground rounded-lg border px-3 py-2 text-sm">
          {translate(
            'auto.components.sidebar.SuppressExternalWorktreeInboxDialog.1f8a5d9e73',
            'You can turn this back on later from project settings.'
          )}
          <Button
            variant="ghost"
            size="xs"
            type="button"
            className="text-foreground focus-visible:bg-accent mt-1 block h-auto border-0 p-0 underline underline-offset-2"
            onClick={onOpenRecovery}
          >
            {translate(
              'auto.components.sidebar.SuppressExternalWorktreeInboxDialog.8c0b2e7a41',
              'Open Non-AgentStart worktrees settings'
            )}
          </Button>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {translate(
              'auto.components.sidebar.SuppressExternalWorktreeInboxDialog.5d1c9f0a82',
              'Cancel'
            )}
          </Button>
          <Button type="button" disabled={pending} onClick={onConfirm}>
            {translate(
              'auto.components.sidebar.SuppressExternalWorktreeInboxDialog.3b7e4a1c96',
              'Hide external worktrees'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
