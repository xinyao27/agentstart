import { useRef } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { Check, Copy, ArrowsOut as Maximize2 } from '~renderer/icons/hugeicons'
import { shellClient } from '~renderer/runtime/shell-client'
import { Button } from '~renderer/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~renderer/ui/dialog'

type MobilePairingQrSectionProps = {
  qrDataUrl: string | null
  pairingUrl: string | null
  endpoint: string | null
  qrEnlarged: boolean
  codeCopied: boolean
  onQrEnlargedChange: (open: boolean) => void
  onCodeCopiedChange: (copied: boolean) => void
  onClearCodeCopiedTimer: () => void
}

export function MobilePairingQrSection({
  qrDataUrl,
  pairingUrl,
  endpoint,
  qrEnlarged,
  codeCopied,
  onQrEnlargedChange,
  onCodeCopiedChange,
  onClearCodeCopiedTimer
}: MobilePairingQrSectionProps): React.JSX.Element | null {
  const pairingCodeButtonMountedRef = useRef(false)
  const codeCopiedResetTimerRef = useRef<number | null>(null)

  const setPairingCodeButtonRef = (node: HTMLButtonElement | null) => {
    pairingCodeButtonMountedRef.current = node !== null
    if (node === null) {
      onClearCodeCopiedTimer()
    }
  }

  async function copyPairingCode() {
    if (!pairingUrl) {
      return
    }
    try {
      await shellClient.ui.writeClipboardText(pairingUrl)
      if (!pairingCodeButtonMountedRef.current) {
        return
      }
      onClearCodeCopiedTimer()
      onCodeCopiedChange(true)
      codeCopiedResetTimerRef.current = window.setTimeout(() => {
        codeCopiedResetTimerRef.current = null
        onCodeCopiedChange(false)
      }, 2000)
    } catch {
      toast.error(
        translate('auto.components.settings.MobilePane.711231348f', 'Failed to copy pairing code')
      )
    }
  }

  if (!qrDataUrl) {
    return null
  }

  return (
    <>
      <div className="border-border/60 flex flex-col items-center gap-3 rounded-lg border py-6">
        <Button
          variant="outline"
          size="xs"
          type="button"
          onClick={() => onQrEnlargedChange(true)}
          className="group border-border/60 focus-visible:bg-accent relative h-auto bg-white p-3"
        >
          <img
            src={qrDataUrl}
            alt={translate(
              'auto.components.settings.MobilePane.6436e56546',
              'QR Code for mobile pairing'
            )}
            className="size-48"
          />
          {/* Why: the icon sits on the QR image's fixed white export surface,
              so its contrast must not follow the surrounding app theme. */}
          <Maximize2 className="can-hover:opacity-0 absolute top-1.5 right-1.5 size-3 text-black/30 transition-opacity group-hover:opacity-100" />
        </Button>
        {endpoint && <span className="text-muted-foreground font-mono text-xs">{endpoint}</span>}
        <p className="text-muted-foreground max-w-xs text-center text-xs">
          {translate(
            'auto.components.settings.MobilePane.310924ad2c',
            'Scan this code with the AgentStart mobile app. Each code creates a unique device token.'
          )}
        </p>
        {pairingUrl && (
          <div className="flex w-full max-w-lg flex-col gap-1.5 px-4">
            <div className="text-muted-foreground text-center text-xs">
              {translate(
                'auto.components.settings.MobilePane.e778ecb209',
                'Or paste this code in the mobile app:'
              )}
            </div>
            <Button
              ref={setPairingCodeButtonRef}
              variant="outline"
              size="sm"
              onClick={() => void copyPairingCode()}
              className="h-auto px-3 py-2 font-mono text-[11px] leading-tight break-all whitespace-normal"
            >
              <span className="flex-1 text-left">{pairingUrl}</span>
              {codeCopied ? (
                <Check className="ml-2 size-3.5 shrink-0 text-emerald-500" />
              ) : (
                <Copy className="ml-2 size-3.5 shrink-0" />
              )}
            </Button>
          </div>
        )}
      </div>

      <Dialog open={qrEnlarged} onOpenChange={onQrEnlargedChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {translate(
                'auto.components.settings.MobilePane.dd3cd78d04',
                'Scan with AgentStart Mobile'
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-lg bg-white p-4">
              <img
                src={qrDataUrl}
                alt={translate(
                  'auto.components.settings.MobilePane.6436e56546',
                  'QR Code for mobile pairing'
                )}
                className="size-72"
              />
            </div>
            {endpoint && (
              <span className="text-muted-foreground font-mono text-xs">{endpoint}</span>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
