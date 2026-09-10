import { translate } from '~renderer/i18n/i18n'
import { DeviceMobile as Smartphone, Trash as Trash2 } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import { mobilePageStyles } from './page-tailwind'

export type PairedDevice = {
  deviceId: string
  name: string
  pairedAt: number
  lastSeenAt: number
}

type HeroPairedProps = {
  devices: readonly PairedDevice[]
  onPairAnother: () => void
  onRevoke: (deviceId: string) => void
  revokingDeviceIds: readonly string[]
}

export function HeroPaired({
  devices,
  onPairAnother,
  onRevoke,
  revokingDeviceIds
}: HeroPairedProps): React.JSX.Element {
  return (
    <div>
      <div className={mobilePageStyles.eyebrowRow}>
        <span className={mobilePageStyles.eyebrow}>
          {translate('auto.components.mobile.MobileHero.5410d55d79', 'AgentStart Mobile')}
        </span>
      </div>
      <h1 className={mobilePageStyles.heading}>
        {devices.length === 1
          ? translate('auto.components.mobile.MobileHero.051978a785', 'Your phone is paired.')
          : translate('auto.components.mobile.MobileHero.d0b52871ce', 'Your phones are paired.')}
      </h1>
      <p className={mobilePageStyles.leadSmall}>
        {translate(
          'auto.components.mobile.MobileHero.266c18c105',
          'Open AgentStart Mobile to pick up where you left off, or pair another device.'
        )}
      </p>
      <ul className={mobilePageStyles.pairedList}>
        {devices.map((device) => {
          const revoking = revokingDeviceIds.includes(device.deviceId)
          return (
            <li key={device.deviceId} className={mobilePageStyles.pairedRow}>
              <div className={mobilePageStyles.pairedIcon}>
                <Smartphone className="size-4" />
              </div>
              <div className={mobilePageStyles.pairedMain}>
                <div className={mobilePageStyles.pairedName}>{device.name}</div>
                <div className={mobilePageStyles.pairedMeta}>
                  {translate('auto.components.mobile.MobileHero.94829abdb1', 'Paired')}{' '}
                  {new Date(device.pairedAt).toLocaleDateString()}
                </div>
              </div>
              <Button
                variant="ghost"
                size="xs"
                type="button"
                className={cn(
                  'p-0 h-auto border-0 focus-visible:bg-accent',
                  mobilePageStyles.pairedRevoke
                )}
                onClick={() => onRevoke(device.deviceId)}
                disabled={revoking}
                aria-label={translate(
                  'auto.components.mobile.MobileHero.34f878d04f',
                  'Revoke {{value0}}',
                  { value0: device.name }
                )}
                title={translate('auto.components.mobile.MobileHero.f9cbf4bb53', 'Revoke device')}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          )
        })}
      </ul>
      <div className={mobilePageStyles.flowActions}>
        <Button
          variant="ghost"
          size="xs"
          type="button"
          className={cn(
            'p-0 h-auto border-0 focus-visible:bg-accent',
            mobilePageStyles.secondaryAction
          )}
          onClick={onPairAnother}
        >
          <Smartphone className="size-3.5" />
          {translate('auto.components.mobile.MobileHero.ff48d9d520', 'Pair another device')}
        </Button>
        <span />
      </div>
    </div>
  )
}
