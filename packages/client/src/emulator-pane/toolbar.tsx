import { translate } from '~renderer/i18n/i18n'
import {
  House as Home,
  Power,
  DeviceMobile as Smartphone,
  ArrowClockwise as RotateCw
} from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~renderer/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import type { SimulatorDeviceRow } from './types'

type EmulatorPaneToolbarProps = {
  displayName: string
  isLive: boolean
  loading: boolean
  devices: SimulatorDeviceRow[]
  selectedUdid: string | null
  onSelectDevice: (udid: string) => void
  onAttach: () => void
  onShutdown: () => void
  onHome: () => void
  onRotate: () => void
}

export function EmulatorPaneToolbar({
  displayName,
  isLive,
  loading,
  devices,
  selectedUdid,
  onSelectDevice,
  onAttach,
  onShutdown,
  onHome,
  onRotate
}: EmulatorPaneToolbarProps) {
  // Why: the toolbar chip describes AgentStart's preview/control stream, not the
  // lower-level CoreSimulator boot state.
  const statusLabel = isLive ? 'Connected' : loading ? 'Working…' : 'Not connected'
  const subtleStatus = isLive || loading
  const statusClassName = subtleStatus
    ? 'text-muted-foreground'
    : 'border-border bg-muted text-muted-foreground'
  const deviceItems = (() =>
    devices.map((device) => ({ label: device.name, value: device.udid })))()

  return (
    <div className="border-border flex items-center gap-2 border-b px-3 py-2">
      <Smartphone className="text-primary size-4 shrink-0" />
      <span className="truncate font-medium">{displayName}</span>
      <span
        className={cn(
          'shrink-0 text-[11px]',
          !subtleStatus && 'rounded border px-1.5 py-0.5 text-[10px]',
          statusClassName
        )}
      >
        {statusLabel}
      </span>
      <div className="flex-1" />
      <Select
        items={deviceItems}
        value={selectedUdid ?? ''}
        onValueChange={(value) => value && onSelectDevice(value)}
        disabled={loading || devices.length === 0}
      >
        <SelectTrigger className="h-7 w-[180px] text-xs">
          <SelectValue
            placeholder={translate(
              'auto.components.emulator.pane.emulator.pane.toolbar.3d836b879c',
              'Choose emulator'
            )}
          />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="start" sideOffset={4}>
          {devices.map((d) => (
            <SelectItem key={d.udid} value={d.udid} className="text-xs">
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={onRotate}
              disabled={!isLive || loading}
              aria-label={translate(
                'auto.components.emulator.pane.emulator.pane.toolbar.6bd8dff42a',
                'Rotate'
              )}
            >
              <RotateCw className="size-3.5" />
              <span className="hidden sm:inline">
                {translate(
                  'auto.components.emulator.pane.emulator.pane.toolbar.6bd8dff42a',
                  'Rotate'
                )}
              </span>
            </Button>
          }
        />
        <TooltipContent side="bottom" sideOffset={4}>
          {translate('auto.components.emulator.pane.emulator.pane.toolbar.6bd8dff42a', 'Rotate')}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="secondary"
              size="icon-xs"
              className="size-7"
              onClick={onHome}
              disabled={!isLive || loading}
              aria-label={translate(
                'auto.components.emulator.pane.emulator.pane.toolbar.e7a0d1897e',
                'Home'
              )}
            >
              <Home className="size-3.5" />
            </Button>
          }
        />
        <TooltipContent side="bottom" sideOffset={4}>
          {translate('auto.components.emulator.pane.emulator.pane.toolbar.e7a0d1897e', 'Home')}
        </TooltipContent>
      </Tooltip>
      {isLive ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                className="text-muted-foreground hover:text-destructive size-7"
                onClick={onShutdown}
                disabled={loading}
                aria-label={translate(
                  'auto.components.emulator.pane.emulator.pane.toolbar.06e10d7356',
                  'Shut down emulator'
                )}
              >
                <Power className="size-3.5" />
              </Button>
            }
          />
          <TooltipContent side="bottom" sideOffset={4}>
            {translate(
              'auto.components.emulator.pane.emulator.pane.toolbar.06e10d7356',
              'Shut down emulator'
            )}
          </TooltipContent>
        </Tooltip>
      ) : (
        <Button
          type="button"
          size="sm"
          variant={loading ? 'ghost' : 'default'}
          className={cn('h-7 px-2 text-xs', loading && 'text-muted-foreground')}
          onClick={onAttach}
          disabled={loading || devices.length === 0}
        >
          {loading
            ? translate(
                'auto.components.emulator.pane.emulator.pane.toolbar.868c0f2938',
                'Working…'
              )
            : translate(
                'auto.components.emulator.pane.emulator.pane.toolbar.81b3571a07',
                'Connect'
              )}
        </Button>
      )}
    </div>
  )
}
