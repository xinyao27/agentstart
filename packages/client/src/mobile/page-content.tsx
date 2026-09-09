import type { MobileNetworkInterface } from '../settings/mobile/network-interface-selection'
import { HeroFlow, HeroIntro, HeroPaired, type PairedDevice } from './hero'
import type { StepIndex } from './hero'
import type { MobilePageStage } from './page-stage'
import { mobilePageStyles } from './page-tailwind'
import { MobilePageToolbar } from './page-toolbar'
import { getMobileReleaseLink } from './release-link'

type MobilePageContentProps = {
  closeMobilePage: () => void
  copyInstallUrl: () => void
  copyPairingCode: () => void
  devices: PairedDevice[]
  enterFlow: () => void
  generatePairing: (rotate: boolean) => void
  handleAddressChange: (address: string) => void
  handleBack: () => void
  handleContinue: () => void
  installQrUrl: string | null
  loadNetworkInterfaces: () => void
  networkInterfaces: MobileNetworkInterface[]
  openInstallUrl: (event: React.MouseEvent<HTMLButtonElement>) => void
  pairAnotherDevice: () => void
  pairLoading: boolean
  pairQrDataUrl: string | null
  pairingUrl: string | null
  refreshingNetworkInterfaces: boolean
  revokeDevice: (id: string) => void
  revokingDeviceIds: string[]
  selectedAddress: string | undefined
  showPairedDevices: (deviceCount: number) => void
  stage: MobilePageStage | null
  stepIdx: StepIndex
}

export function MobilePageContent({
  closeMobilePage,
  copyInstallUrl,
  copyPairingCode,
  devices,
  enterFlow,
  generatePairing,
  handleAddressChange,
  handleBack,
  handleContinue,
  installQrUrl,
  loadNetworkInterfaces,
  networkInterfaces,
  openInstallUrl,
  pairAnotherDevice,
  pairLoading,
  pairQrDataUrl,
  pairingUrl,
  refreshingNetworkInterfaces,
  revokeDevice,
  revokingDeviceIds,
  selectedAddress,
  showPairedDevices,
  stage,
  stepIdx
}: MobilePageContentProps): React.JSX.Element {
  return (
    <div className={mobilePageStyles.root}>
      <MobilePageToolbar onClose={closeMobilePage} />
      <section className={mobilePageStyles.hero}>
        <div className={mobilePageStyles.heroCopy}>
          {stage === null ? null : stage === 'intro' ? (
            <HeroIntro onStart={enterFlow} />
          ) : stage === 'paired' ? (
            <HeroPaired
              devices={devices}
              onPairAnother={pairAnotherDevice}
              onRevoke={(id) => revokeDevice(id)}
              revokingDeviceIds={revokingDeviceIds}
            />
          ) : (
            <HeroFlow
              stepIdx={stepIdx}
              installQrUrl={installQrUrl}
              installCopy={getMobileReleaseLink()}
              onOpenInstallUrl={openInstallUrl}
              onCopyInstallUrl={copyInstallUrl}
              pairQrDataUrl={pairQrDataUrl}
              pairingUrl={pairingUrl}
              pairLoading={pairLoading}
              onRegeneratePairing={() => generatePairing(true)}
              onCopyPairingCode={copyPairingCode}
              networkInterfaces={networkInterfaces}
              selectedAddress={selectedAddress}
              onSelectedAddressChange={handleAddressChange}
              onRefreshNetworkInterfaces={loadNetworkInterfaces}
              refreshingNetworkInterfaces={refreshingNetworkInterfaces}
              onBack={handleBack}
              onContinue={handleContinue}
              onDone={devices.length > 0 ? () => showPairedDevices(devices.length) : undefined}
            />
          )}
        </div>
      </section>
    </div>
  )
}
