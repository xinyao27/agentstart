import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { WindowsFirewallNotice } from '~renderer/mobile/windows-firewall-notice'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import {
  getMobilePairingQR,
  listMobileNetworkInterfaces,
  listPairedMobileDevices,
  revokePairedMobileDevice
} from '~renderer/runtime/mobile-pairing-client'
import { useAppStore } from '~renderer/store/state'

import { MobileAutoRestoreFitSection } from './auto-restore-fit-section'
import {
  selectRefreshedNetworkAddress,
  type MobileNetworkInterface
} from './network-interface-selection'
import { MobilePairedDevicesSection, type PairedDevice } from './paired-devices-section'
import { useMobilePairingDevicePolling } from './pairing-device-polling'
import { MobilePairingQrSection } from './pairing-qr-section'
import { MobilePairingSetupSection } from './pairing-setup-section'
export function MobilePane(): React.JSX.Element {
  const autoRestoreFitMs = useAppStore((s) => s.settings?.mobileAutoRestoreFitMs ?? null)
  const activeRuntimeEnvironmentId = useAppStore(
    (s) => s.settings?.activeRuntimeEnvironmentId ?? null
  )
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [pairingUrl, setPairingUrl] = useState<string | null>(null)
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [devices, setDevices] = useState<PairedDevice[]>([])
  const [qrEnlarged, setQrEnlarged] = useState(false)
  const [networkInterfaces, setNetworkInterfaces] = useState<MobileNetworkInterface[]>([])
  const [selectedAddress, setSelectedAddress] = useState<string | undefined>(undefined)
  const [refreshingNetworkInterfaces, setRefreshingNetworkInterfaces] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [deviceCountAtQr, setDeviceCountAtQr] = useState<number | null>(null)
  const [rotateNextQr, setRotateNextQr] = useState(false)
  const devicesRef = useRef<PairedDevice[]>([])
  const codeCopiedResetTimerRef = useRef<number | null>(null)
  const mountedRef = useMountedRef()

  const clearCodeCopiedResetTimer = (): void => {
    if (codeCopiedResetTimerRef.current !== null) {
      window.clearTimeout(codeCopiedResetTimerRef.current)
      codeCopiedResetTimerRef.current = null
    }
  }

  const loadDevices = useEventCallback(async () => {
    try {
      const result = await listPairedMobileDevices({ activeRuntimeEnvironmentId })
      if (mountedRef.current) {
        devicesRef.current = result.devices
        setDevices(result.devices)
      }
    } catch {
      // Silently fail — device list is non-critical
    }
  })

  const loadNetworkInterfaces = useEventCallback(async (opts: { notifyOnError?: boolean } = {}) => {
    setRefreshingNetworkInterfaces(true)
    try {
      const result = await listMobileNetworkInterfaces({ activeRuntimeEnvironmentId })
      if (mountedRef.current) {
        setNetworkInterfaces(result.interfaces)
        setSelectedAddress((currentAddress) =>
          selectRefreshedNetworkAddress(currentAddress, result.interfaces)
        )
      }
    } catch {
      if (opts.notifyOnError && mountedRef.current) {
        toast.error(
          translate(
            'auto.components.settings.MobilePane.d714614dbf',
            'Failed to refresh network interfaces'
          )
        )
      }
    } finally {
      if (mountedRef.current) {
        setRefreshingNetworkInterfaces(false)
      }
    }
  })

  const generateQR = async (opts: { rotate?: boolean } = {}) => {
    setLoading(true)
    try {
      const result = await getMobilePairingQR(
        {
          ...(selectedAddress ? { address: selectedAddress } : {}),
          ...(opts.rotate || rotateNextQr ? { rotate: true } : {})
        },
        { activeRuntimeEnvironmentId }
      )
      if (result.available) {
        useAppStore.getState().recordFeatureInteraction('mobile-pairing')
        if (mountedRef.current) {
          setQrDataUrl(result.qrDataUrl)
          setPairingUrl(result.pairingUrl)
          setEndpoint(result.endpoint)
          setDeviceCountAtQr(devicesRef.current.length)
          clearCodeCopiedResetTimer()
          setCodeCopied(false)
          setRotateNextQr(false)
          void loadDevices()
        }
      } else {
        if (mountedRef.current) {
          toast.error(
            translate(
              'auto.components.settings.MobilePane.cb9067c1c1',
              'WebSocket transport is not running'
            )
          )
        }
      }
    } catch {
      if (mountedRef.current) {
        toast.error(
          translate('auto.components.settings.MobilePane.e3c427e020', 'Failed to generate QR code')
        )
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    void loadDevices()
    void loadNetworkInterfaces()
  }, [loadDevices, loadNetworkInterfaces])

  useMobilePairingDevicePolling({
    deviceCountAtQr,
    currentDeviceCount: devices.length,
    loadDevices
  })

  async function revokeDevice(deviceId: string) {
    try {
      await revokePairedMobileDevice({ deviceId }, { activeRuntimeEnvironmentId })
      if (mountedRef.current) {
        setDevices((prev) => {
          const nextDevices = prev.filter((d) => d.deviceId !== deviceId)
          devicesRef.current = nextDevices
          return nextDevices
        })
        toast.success(translate('auto.components.settings.MobilePane.2e3dd0bc29', 'Device revoked'))
      }
    } catch {
      if (mountedRef.current) {
        toast.error(
          translate('auto.components.settings.MobilePane.870e1b5ca5', 'Failed to revoke device')
        )
      }
    }
  }

  return (
    <div className="space-y-6">
      <MobilePairingSetupSection
        networkInterfaces={networkInterfaces}
        selectedAddress={selectedAddress}
        onSelectedAddressChange={setSelectedAddress}
        refreshingNetworkInterfaces={refreshingNetworkInterfaces}
        onRefreshNetworkInterfaces={() => void loadNetworkInterfaces({ notifyOnError: true })}
        loading={loading}
        hasQrCode={qrDataUrl != null}
        onGenerateQr={() => void generateQR({ rotate: qrDataUrl != null })}
      />

      <MobilePairingQrSection
        qrDataUrl={qrDataUrl}
        pairingUrl={pairingUrl}
        endpoint={endpoint}
        qrEnlarged={qrEnlarged}
        codeCopied={codeCopied}
        onQrEnlargedChange={setQrEnlarged}
        onCodeCopiedChange={setCodeCopied}
        onClearCodeCopiedTimer={clearCodeCopiedResetTimer}
      />

      <WindowsFirewallNotice pairingReady={qrDataUrl != null} address={selectedAddress} />

      <MobilePairedDevicesSection
        devices={devices}
        hasQrCode={qrDataUrl != null}
        onRevokeDevice={(deviceId) => void revokeDevice(deviceId)}
      />

      <MobileAutoRestoreFitSection
        autoRestoreFitMs={autoRestoreFitMs}
        onAutoRestoreFitChange={(ms) => void updateSettings({ mobileAutoRestoreFitMs: ms })}
      />
    </div>
  )
}
