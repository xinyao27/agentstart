import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
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

import { getExtensionBrowserCapabilities } from '../browser-capabilities'

type BrowserContextCaptureDialogProps = {
  onOpenChange: (open: boolean) => void
  open: boolean
}

export function BrowserContextCaptureDialog({
  onOpenChange,
  open
}: BrowserContextCaptureDialogProps): React.JSX.Element {
  const capabilities = getExtensionBrowserCapabilities()
  const queryClient = useQueryClient()
  const capture = useMutation({
    mutationFn: capabilities.captureActivePageContext,
    onSuccess: (context) => {
      queryClient.setQueryData(['extension-host', 'pending-page-context'], context)
      onOpenChange(false)
      toast.success(translate('extension.context.captureReady', 'Page context is ready to review.'))
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-sm" showCloseButton={!capture.isPending}>
        <DialogHeader>
          <DialogTitle>
            {translate('extension.context.captureTitle', 'Use the current page in AgentStart?')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'extension.context.captureDescription',
              'AgentStart will read visible page text and show it for review before anything is sent to an agent.'
            )}
          </DialogDescription>
        </DialogHeader>
        {capture.isError ? (
          <p className="text-destructive text-xs">
            {translate(
              'extension.context.captureFailed',
              'The page could not be read. Check Chrome site access and try again.'
            )}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" disabled={capture.isPending} onClick={() => capture.mutate('once')}>
            {translate('extension.context.captureTab', 'Only this time')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={capture.isPending}
            onClick={() => capture.mutate('always-site')}
          >
            {translate('extension.context.alwaysSite', 'Always allow this site')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
