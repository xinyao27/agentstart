import { translate } from '~renderer/i18n/i18n'
import { HardDrive } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~renderer/ui/dialog'

export function TerminalSessionStateSaveFailureDialog({
  open,
  onDismiss,
  onOpenSpaceAnalyzer
}: {
  open: boolean
  onDismiss: () => void
  onOpenSpaceAnalyzer: () => void
}): React.JSX.Element {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onDismiss()
        }
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader className="gap-3">
          <div className="flex items-center gap-3">
            <div className="border-border bg-muted/40 flex size-8 shrink-0 items-center justify-center rounded-md border">
              <HardDrive className="text-muted-foreground size-4" />
            </div>
            <DialogTitle className="text-base">
              {translate(
                'auto.components.terminal.pane.TerminalSessionStateSaveFailureDialog.678c780a2c',
                'Disk space is unavailable'
              )}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs leading-5">
            {translate(
              'auto.components.terminal.pane.TerminalSessionStateSaveFailureDialog.e2fcf07c0d',
              'AgentStart could not save this terminal session because local storage is full or not writable. Open the disk space analyzer to find workspace storage you can clean up.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="border-border bg-muted/35 text-muted-foreground rounded-md border px-3 py-2.5 text-xs leading-5">
          {translate(
            'auto.components.terminal.pane.TerminalSessionStateSaveFailureDialog.38c282a2c4',
            'The analyzer opens directly from here. You can also open it later from the lower-left toolbox menu by choosing Space Analyzer.'
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onDismiss}>
            {translate(
              'auto.components.terminal.pane.TerminalSessionStateSaveFailureDialog.ae20d0ffc2',
              'Dismiss'
            )}
          </Button>
          <Button type="button" size="sm" autoFocus onClick={onOpenSpaceAnalyzer}>
            {translate(
              'auto.components.terminal.pane.TerminalSessionStateSaveFailureDialog.6bee0c8f17',
              'Open Disk Space Analyzer'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
