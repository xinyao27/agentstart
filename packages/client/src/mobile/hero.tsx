import { type ComponentProps, useLayoutEffect, useRef, useState } from 'react'
import { Copy, ArrowLeft, ArrowRight, ArrowClockwise as RefreshCw } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import type { MobileNetworkInterface } from '../settings/mobile/network-interface-selection'
import { IosBrandIcon } from './brand-icons'
import { NetworkInterfacePicker } from './network-interface-picker'
import type { MobileReleaseLink } from './release-link'
import { WindowsFirewallNotice } from './windows-firewall-notice'
export { HeroIntro } from './hero-intro'
export { HeroPaired, type PairedDevice } from './hero-paired-devices'
import { translate } from '~renderer/i18n/i18n'

import { mobilePageStyles } from './page-tailwind'

export type StepIndex = 0 | 1

// Why: mobilePageStyles owns these bespoke hit targets; Button supplies interaction styling only.
function MobileHeroButton({
  className,
  ...props
}: ComponentProps<typeof Button>): React.JSX.Element {
  return <Button variant="ghost" size="xs" className={cn('h-auto p-0', className)} {...props} />
}

// Why: header copy needs to refer to the *user's* device by its native name.
function getDeviceLabel(): string {
  const ua = navigator.userAgent
  if (ua.includes('Mac')) {
    return 'Mac'
  }
  if (ua.includes('Windows')) {
    return 'PC'
  }
  return 'computer'
}

type HeroFlowProps = {
  stepIdx: StepIndex
  installQrUrl: string | null
  installCopy: MobileReleaseLink
  onOpenInstallUrl: (event: React.MouseEvent<HTMLButtonElement>) => void
  onCopyInstallUrl: () => void
  pairQrDataUrl: string | null
  pairingUrl: string | null
  pairLoading: boolean
  onRegeneratePairing: () => void
  onCopyPairingCode: () => void
  networkInterfaces: readonly MobileNetworkInterface[]
  selectedAddress: string | undefined
  onSelectedAddressChange: (address: string) => void
  onRefreshNetworkInterfaces: () => void
  refreshingNetworkInterfaces: boolean
  onBack: () => void
  onContinue: () => void
  onDone?: () => void
}

export function HeroFlow({
  stepIdx,
  installQrUrl,
  installCopy,
  onOpenInstallUrl,
  onCopyInstallUrl,
  pairQrDataUrl,
  pairingUrl,
  pairLoading,
  onRegeneratePairing,
  onCopyPairingCode,
  networkInterfaces,
  selectedAddress,
  onSelectedAddressChange,
  onRefreshNetworkInterfaces,
  refreshingNetworkInterfaces,
  onBack,
  onContinue,
  onDone
}: HeroFlowProps): React.JSX.Element {
  const isLast = stepIdx === 1
  const screenRefs = useRef<(HTMLDivElement | null)[]>([])
  const [viewportHeight, setViewportHeight] = useState<number>()

  useLayoutEffect(() => {
    const activeScreen = screenRefs.current[stepIdx]
    if (!activeScreen) {
      return
    }

    const measure = (): void => setViewportHeight(activeScreen.scrollHeight)
    measure()

    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(activeScreen)
    return () => observer.disconnect()
  }, [stepIdx])

  return (
    <div className={mobilePageStyles.flowCard}>
      <div
        className={mobilePageStyles.flowViewport}
        style={viewportHeight === undefined ? undefined : { height: viewportHeight }}
      >
        <div
          ref={(element) => {
            screenRefs.current[0] = element
          }}
          className={cn(
            mobilePageStyles.flowScreen,
            stepIdx === 0 ? mobilePageStyles.flowScreenActive : mobilePageStyles.flowScreenPast
          )}
          aria-hidden={stepIdx !== 0}
          inert={stepIdx !== 0}
        >
          <div className={mobilePageStyles.stepLayout}>
            <div className={mobilePageStyles.stepCopy}>
              <div className={mobilePageStyles.eyebrowRow}>
                <div className={mobilePageStyles.stepNumber}>{stepIdx + 1}</div>
                <span className={mobilePageStyles.eyebrow}>
                  {translate('auto.components.mobile.MobileHero.92ddfdfa1f', 'Step 1 of 2')}
                </span>
              </div>
              <h2 className={mobilePageStyles.stepHeading}>
                {translate('auto.components.mobile.MobileHero.0d9b33299e', 'Get the app.')}
              </h2>
              <p className={mobilePageStyles.leadSmall}>
                {translate(
                  'auto.components.mobile.MobileHero.e75647ace0',
                  'Scan the QR with your phone or open the install link to grab Yiru Mobile.'
                )}
              </p>
              <div className={mobilePageStyles.platformTabs}>
                <span
                  className={cn(mobilePageStyles.platformTab, mobilePageStyles.platformTabActive)}
                >
                  <IosBrandIcon />
                  {translate('auto.components.mobile.MobileHero.711e6f4b47', 'iOS')}
                </span>
              </div>
              <div className={mobilePageStyles.inlineActions}>
                <MobileHeroButton
                  type="button"
                  className={cn('border-0 focus-visible:bg-accent', mobilePageStyles.ghostAction)}
                  onClick={onOpenInstallUrl}
                >
                  {installCopy.ctaLabel}
                </MobileHeroButton>
                <MobileHeroButton
                  type="button"
                  className={cn('border-0 focus-visible:bg-accent', mobilePageStyles.textLink)}
                  onClick={onCopyInstallUrl}
                >
                  <Copy className="size-3.5" />
                  {translate('auto.components.mobile.MobileHero.aa97420ba4', 'Copy install link')}
                </MobileHeroButton>
              </div>
            </div>
            <div
              className={cn(mobilePageStyles.qr, mobilePageStyles.qrLarge, 'mt-[72px]')}
              aria-label={translate(
                'auto.components.mobile.MobileHero.7af266b80d',
                'Install QR code'
              )}
            >
              {installQrUrl ? (
                <img
                  src={installQrUrl}
                  alt={translate('auto.components.mobile.MobileHero.3241f3c26a', 'Install QR')}
                  className={mobilePageStyles.qrImage}
                />
              ) : null}
            </div>
          </div>
        </div>

        <div
          ref={(element) => {
            screenRefs.current[1] = element
          }}
          className={cn(
            mobilePageStyles.flowScreen,
            stepIdx === 1 && mobilePageStyles.flowScreenActive
          )}
          aria-hidden={stepIdx !== 1}
          inert={stepIdx !== 1}
        >
          <div className={mobilePageStyles.pairingLayout}>
            <div className={cn(mobilePageStyles.stepCopy, mobilePageStyles.pairingCopy)}>
              <div className={mobilePageStyles.eyebrowRow}>
                <div className={mobilePageStyles.stepNumber}>2</div>
                <span className={mobilePageStyles.eyebrow}>
                  {translate('auto.components.mobile.MobileHero.3960f5c339', 'Step 2 of 2')}
                </span>
              </div>
              <h2 className={mobilePageStyles.stepHeading}>
                {translate('auto.components.mobile.MobileHero.901c98bb93', 'Pair this')}{' '}
                {getDeviceLabel()}.
              </h2>
              <p className={mobilePageStyles.leadSmall}>
                {translate('auto.components.mobile.MobileHero.d1495e5e64', 'Open Yiru Mobile, tap')}{' '}
                <strong>
                  {translate('auto.components.mobile.MobileHero.3aa7bb2d8b', 'Pair Desktop')}
                </strong>
                {translate('auto.components.mobile.MobileHero.2f077ef4eb', ', and scan the code.')}
              </p>
            </div>
            <div className={cn(mobilePageStyles.qrStack, mobilePageStyles.pairingQr)}>
              <div
                className={cn(mobilePageStyles.qr, mobilePageStyles.qrLarge)}
                aria-label={translate(
                  'auto.components.mobile.MobileHero.bb0074ce11',
                  'Pairing QR code'
                )}
                aria-busy={pairLoading}
              >
                {pairQrDataUrl ? (
                  <img
                    src={pairQrDataUrl}
                    alt={translate('auto.components.mobile.MobileHero.27735e5f4e', 'Pairing QR')}
                    className={cn(
                      mobilePageStyles.qrImage,
                      pairLoading && mobilePageStyles.qrRefreshing
                    )}
                  />
                ) : null}
                {pairLoading ? (
                  <span className={mobilePageStyles.qrLoading}>
                    {translate('auto.components.mobile.MobileHero.65b3f2e8bc', 'Generating…')}
                  </span>
                ) : null}
              </div>
              <MobileHeroButton
                type="button"
                className={cn('border-0 focus-visible:bg-accent', mobilePageStyles.linkUnder)}
                onClick={onRegeneratePairing}
                disabled={pairLoading}
              >
                {pairLoading
                  ? translate('auto.components.mobile.MobileHero.65b3f2e8bc', 'Generating…')
                  : pairQrDataUrl
                    ? translate('auto.components.mobile.MobileHero.e59a252eca', 'Regenerate code')
                    : translate('auto.components.mobile.MobileHero.a6cffbbb0b', 'Generate code')}
              </MobileHeroButton>
            </div>
            <div className={mobilePageStyles.pairingControls}>
              <div className={mobilePageStyles.networkRow}>
                <span className={mobilePageStyles.networkLabel}>
                  {translate('auto.components.mobile.MobileHero.dfd2aa9d5d', 'Network')}
                </span>
                <NetworkInterfacePicker
                  networkInterfaces={networkInterfaces}
                  selectedAddress={selectedAddress}
                  onSelectedAddressChange={onSelectedAddressChange}
                  // Why: direct-first and local-only pairing both advertise a
                  // local route; keeping it visible also prevents mode shifts.
                  disabled={false}
                  className={mobilePageStyles.networkSelect}
                />
                <MobileHeroButton
                  type="button"
                  className={cn(
                    'border-0 focus-visible:bg-accent',
                    mobilePageStyles.networkRefresh
                  )}
                  onClick={onRefreshNetworkInterfaces}
                  disabled={refreshingNetworkInterfaces}
                  aria-label={translate(
                    'auto.components.mobile.MobileHero.85067b9e06',
                    'Refresh network interfaces'
                  )}
                  title={translate(
                    'auto.components.mobile.MobileHero.85067b9e06',
                    'Refresh network interfaces'
                  )}
                >
                  {refreshingNetworkInterfaces ? (
                    <LoadingIndicator className="size-3.5" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                </MobileHeroButton>
              </div>

              <div className={mobilePageStyles.inlineActions}>
                <span className={mobilePageStyles.actionDivider}>
                  {translate('auto.components.mobile.MobileHero.4c1df4eba7', "Can't scan?")}
                </span>
                <MobileHeroButton
                  type="button"
                  className={cn('border-0 focus-visible:bg-accent', mobilePageStyles.textLink)}
                  onClick={onCopyPairingCode}
                  disabled={!pairingUrl || pairLoading}
                >
                  <Copy className="size-3.5" />
                  {translate('auto.components.mobile.MobileHero.010dddcf27', 'Copy pairing code')}
                </MobileHeroButton>
              </div>
              <WindowsFirewallNotice
                pairingReady={pairQrDataUrl != null}
                address={selectedAddress}
                className="mt-3"
              />
            </div>
          </div>
        </div>
      </div>

      <div className={mobilePageStyles.flowActions}>
        <MobileHeroButton
          type="button"
          className={cn('border-0 focus-visible:bg-accent', mobilePageStyles.flowBack)}
          onClick={onBack}
        >
          <ArrowLeft className="size-3" />
          {translate('auto.components.mobile.MobileHero.b622eba64d', 'Back')}
        </MobileHeroButton>
        {isLast ? (
          onDone ? (
            <MobileHeroButton
              type="button"
              className={cn(
                'border',
                mobilePageStyles.primaryAction,
                mobilePageStyles.flowPrimaryAction
              )}
              onClick={onDone}
            >
              {translate('auto.components.mobile.MobileHero.3f90dbd274', 'Done')}
              <ArrowRight className="size-3.5" />
            </MobileHeroButton>
          ) : (
            <span />
          )
        ) : (
          <MobileHeroButton
            type="button"
            className={cn(
              'border-0 focus-visible:bg-accent',
              mobilePageStyles.flowContinue,
              mobilePageStyles.flowPrimaryAction
            )}
            onClick={onContinue}
          >
            {translate('auto.components.mobile.MobileHero.a8fb43cf1c', 'Continue')}
            <ArrowRight className="size-3.5" />
          </MobileHeroButton>
        )}
      </div>
    </div>
  )
}
