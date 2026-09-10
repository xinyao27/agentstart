import { openHttpLink } from '~renderer/editor/http-link-routing'
import { translate } from '~renderer/i18n/i18n'
import {
  QrCode,
  ArrowSquareOut as ExternalLink,
  ArrowClockwise as RefreshCw
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { NetworkInterfacePicker } from '~renderer/mobile/network-interface-picker'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '~renderer/ui/accordion'
import { Button } from '~renderer/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import type { MobileNetworkInterface } from './network-interface-selection'

const TAILSCALE_DOWNLOAD_URL = 'https://tailscale.com/download'

type MobilePairingSetupSectionProps = {
  networkInterfaces: MobileNetworkInterface[]
  selectedAddress: string | undefined
  onSelectedAddressChange: (address: string) => void
  refreshingNetworkInterfaces: boolean
  onRefreshNetworkInterfaces: () => void
  loading: boolean
  hasQrCode: boolean
  onGenerateQr: () => void
}

export function MobilePairingSetupSection({
  networkInterfaces,
  selectedAddress,
  onSelectedAddressChange,
  refreshingNetworkInterfaces,
  onRefreshNetworkInterfaces,
  loading,
  hasQrCode,
  onGenerateQr
}: MobilePairingSetupSectionProps): React.JSX.Element {
  return (
    <section>
      <h3 className="text-sm font-medium">
        {translate('auto.components.settings.MobilePairingSetupSection.title', 'Pair a phone')}
      </h3>
      <p className="text-muted-foreground mt-1 text-xs">
        {translate(
          'auto.components.settings.MobilePairingSetupSection.localDescription',
          'The pairing code connects through the local or private-network address below.'
        )}
      </p>
      <Button
        onClick={onGenerateQr}
        disabled={loading || !selectedAddress}
        size="sm"
        className="mt-3 gap-1.5"
      >
        {loading ? (
          <LoadingIndicator className="size-3.5" />
        ) : hasQrCode ? (
          <RefreshCw className="size-3.5" />
        ) : (
          <QrCode className="size-3.5" />
        )}
        {hasQrCode
          ? translate('auto.components.settings.MobilePairingSetupSection.regenerate', 'Regenerate')
          : translate(
              'auto.components.settings.MobilePairingSetupSection.generate',
              'Generate QR Code'
            )}
      </Button>

      <div className="border-border/60 mt-4 space-y-3 border-t pt-4">
        <div className="space-y-1">
          <h4 className="text-xs font-medium">
            {translate(
              'auto.components.settings.MobilePairingSetupSection.localSettings',
              'Local connection settings'
            )}
          </h4>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.MobilePairingSetupSection.localAddressDescription',
              'Choose the LAN or private-network address that AgentStart Mobile can use to reach this computer directly.'
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <NetworkInterfacePicker
            networkInterfaces={networkInterfaces}
            selectedAddress={selectedAddress}
            onSelectedAddressChange={onSelectedAddressChange}
            className="min-w-[220px] justify-between font-normal"
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={onRefreshNetworkInterfaces}
                  disabled={refreshingNetworkInterfaces}
                  aria-label={translate(
                    'auto.components.settings.MobilePairingSetupSection.refresh',
                    'Refresh network interfaces'
                  )}
                  className="text-muted-foreground"
                >
                  {refreshingNetworkInterfaces ? <LoadingIndicator /> : <RefreshCw />}
                </Button>
              }
            />
            <TooltipContent side="bottom" sideOffset={6}>
              {translate(
                'auto.components.settings.MobilePairingSetupSection.refresh',
                'Refresh network interfaces'
              )}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <Accordion className="mt-2">
        <AccordionItem value="tailnet-guide" className="border-b-0">
          <AccordionTrigger className="py-2 text-xs">
            {translate(
              'auto.components.settings.MobilePairingSetupSection.tailnet',
              'Connect with your own tailnet'
            )}
          </AccordionTrigger>
          <AccordionContent className="text-muted-foreground space-y-3 text-xs">
            <p>
              {translate(
                'auto.components.settings.MobilePairingSetupSection.tailnetDescription',
                'Install Tailscale on this computer and your phone, sign in to the same tailnet, then select its 100.x.y.z address above.'
              )}
            </p>
            <Button
              variant="ghost"
              size="xs"
              type="button"
              onClick={(event) => openHttpLink(TAILSCALE_DOWNLOAD_URL, { event })}
              className="text-foreground focus-visible:bg-accent h-auto border-0 p-0 underline-offset-2 hover:underline"
            >
              {translate(
                'auto.components.settings.MobilePairingSetupSection.getTailscale',
                'Get Tailscale'
              )}
              <ExternalLink className="size-3" />
            </Button>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  )
}
