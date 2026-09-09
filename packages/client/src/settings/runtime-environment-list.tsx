import { translate } from '~renderer/i18n/i18n'
import {
  Warning as AlertTriangle,
  HardDrives as Host,
  HardDrive as HostOff,
  Trash as Trash2,
  ArrowClockwise as RefreshCw
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import type { PublicKnownRuntimeEnvironment } from '~renderer/runtime/environment-model'
import type { RemoteServerUpdateEntry } from '~renderer/runtime/remote-server-update-model'
import { cn } from '~renderer/ui/class-names'

import { Button } from '../ui/button'
import {
  getRemoteServerManualUpdateHelp,
  RemoteServerUpdateStatus
} from './remote-server-update-status'
import {
  getHostDetailsDescription,
  getHostDetailsSummary,
  getRuntimeServerConnectionLabel,
  getRuntimeServerConnectionState,
  getRuntimeServerDotClass,
  type RuntimeHostDetails
} from './runtime-environment-status'
import { RuntimeEnvironmentRepair } from './runtime-environment/repair'

type RuntimeEnvironmentListProps = {
  environments: PublicKnownRuntimeEnvironment[]
  detailsByEnvironmentId: Record<string, RuntimeHostDetails>
  activeEnvironmentId: string | null
  updates: Map<string, RemoteServerUpdateEntry>
  updatesChecking: boolean
  updatesRunning: boolean
  updateCheckHint: string
  connectingId: string | null
  switchingValue: string | null
  disconnectingId: string | null
  removingId: string | null
  isBusy: boolean
  onCheckUpdates: (event: React.MouseEvent<HTMLButtonElement>) => void
  onOpenUpdates: () => void
  onConnect: (environment: PublicKnownRuntimeEnvironment) => void
  onDisconnect: (environment: PublicKnownRuntimeEnvironment) => void
  onRemove: (environment: PublicKnownRuntimeEnvironment) => void
}

export function RuntimeEnvironmentList(props: RuntimeEnvironmentListProps): React.JSX.Element {
  return (
    <div className="space-y-3">
      <div
        data-settings-section="remote-server-updates"
        className="flex items-center justify-between gap-3"
      >
        <div className="min-w-0 space-y-0.5">
          <div className="text-sm font-medium">
            {translate(
              'auto.components.settings.RuntimeEnvironmentsPane.connectToRemoteServers',
              'Remote daemons'
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.RuntimeEnvironmentsPane.connectToRemoteServersHelp',
              'Connect, disconnect, or inspect configured remote daemons.'
            )}
          </p>
        </div>
        {props.environments.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            title={props.updateCheckHint}
            onClick={props.onCheckUpdates}
            disabled={props.updatesChecking && props.updates.size === 0}
          >
            {props.updatesChecking || props.updatesRunning ? <LoadingIndicator /> : <RefreshCw />}
            {props.updatesRunning
              ? translate(
                  'auto.components.settings.RuntimeEnvironmentsPane.updatingServers',
                  'Updating hosts…'
                )
              : translate(
                  'auto.components.settings.RuntimeEnvironmentsPane.reviewServerUpdates',
                  'Check for host updates'
                )}
          </Button>
        ) : null}
      </div>
      <div className="border-border/50 bg-card/30 border">
        {props.environments.length === 0 ? (
          <div className="text-muted-foreground px-3 py-4 text-sm">
            {translate(
              'auto.components.settings.RuntimeEnvironmentsPane.9a3758d983',
              'No remote daemons connected.'
            )}
          </div>
        ) : (
          <div className="divide-border/50 divide-y">
            {props.environments.map((environment) => (
              <RuntimeEnvironmentRow
                key={environment.id}
                environment={environment}
                details={props.detailsByEnvironmentId[environment.id]}
                isActive={props.activeEnvironmentId === environment.id}
                update={props.updates.get(environment.id)}
                updatesRunning={props.updatesRunning}
                connectingId={props.connectingId}
                switchingValue={props.switchingValue}
                disconnectingId={props.disconnectingId}
                removingId={props.removingId}
                isBusy={props.isBusy}
                onOpenUpdates={props.onOpenUpdates}
                onConnect={props.onConnect}
                onDisconnect={props.onDisconnect}
                onRemove={props.onRemove}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

type RuntimeEnvironmentRowProps = {
  environment: PublicKnownRuntimeEnvironment
  details: RuntimeHostDetails | undefined
  isActive: boolean
  update: RemoteServerUpdateEntry | undefined
  updatesRunning: boolean
  connectingId: string | null
  switchingValue: string | null
  disconnectingId: string | null
  removingId: string | null
  isBusy: boolean
  onOpenUpdates: () => void
  onConnect: (environment: PublicKnownRuntimeEnvironment) => void
  onDisconnect: (environment: PublicKnownRuntimeEnvironment) => void
  onRemove: (environment: PublicKnownRuntimeEnvironment) => void
}

function RuntimeEnvironmentRow(props: RuntimeEnvironmentRowProps): React.JSX.Element {
  const { environment, details, update } = props
  const description = getHostDetailsDescription(details)
  const connectionState = getRuntimeServerConnectionState(details)
  const isReachable = connectionState === 'connected'
  const actionBusy =
    props.connectingId === environment.id ||
    props.switchingValue === environment.id ||
    props.disconnectingId === environment.id ||
    props.removingId === environment.id
  return (
    <div data-settings-section={environment.id} className="flex items-center gap-3 px-4 py-3">
      <Host className="text-muted-foreground size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-sm font-medium">{environment.name}</div>
          <span className={cn('size-2 shrink-0', getRuntimeServerDotClass(connectionState))} />
          <span className="text-muted-foreground text-[11px]">
            {environment.pairingRequired
              ? translate('runtimeEnvironment.pairingRequired', 'Re-pairing required')
              : getRuntimeServerConnectionLabel(connectionState)}
          </span>
          {details?.compatibility?.kind === 'blocked' ? (
            <AlertTriangle className="text-destructive size-3.5 shrink-0" />
          ) : details?.status === 'loading' ? (
            <LoadingIndicator className="text-muted-foreground size-3.5 shrink-0" />
          ) : null}
        </div>
        <p className="text-muted-foreground truncate text-xs">
          {environment.pairingRequired
            ? environment.endpoints[0]?.endpoint
            : props.isActive
              ? translate(
                  'auto.components.settings.RuntimeEnvironmentsPane.activeServerRowHelp',
                  'Active remote daemon for routed projects, terminals, and provider checks.'
                )
              : getHostDetailsSummary(details)}
        </p>
        {!environment.pairingRequired && description ? (
          <p
            className={cn(
              'mt-0.5 truncate text-xs',
              details?.compatibility?.kind === 'blocked'
                ? 'text-destructive'
                : 'text-muted-foreground'
            )}
          >
            {description}
          </p>
        ) : null}
        {environment.pairingRequired ? (
          <RuntimeEnvironmentRepair environmentId={environment.id} />
        ) : null}
        {!environment.pairingRequired && update ? (
          <RuntimeEnvironmentUpdate entry={update} />
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!environment.pairingRequired &&
        (update?.phase === 'available' || update?.phase === 'failed') ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={props.onOpenUpdates}
            disabled={props.updatesRunning}
          >
            {translate('auto.components.settings.RuntimeEnvironmentsPane.updateServer', 'Update')}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="gap-1.5"
          onClick={() =>
            isReachable ? props.onDisconnect(environment) : props.onConnect(environment)
          }
          disabled={
            environment.pairingRequired ||
            actionBusy ||
            (!isReachable && connectionState === 'checking')
          }
        >
          {isReachable ? (
            props.disconnectingId === environment.id ? (
              <LoadingIndicator className="size-3" />
            ) : (
              <HostOff className="size-3" />
            )
          ) : props.connectingId === environment.id ? (
            <LoadingIndicator className="size-3" />
          ) : (
            <Host className="size-3" />
          )}
          {isReachable
            ? translate('auto.components.settings.RuntimeEnvironmentsPane.disconnect', 'Disconnect')
            : translate('auto.components.settings.RuntimeEnvironmentsPane.connect', 'Connect')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => props.onRemove(environment)}
          className="text-muted-foreground size-7 hover:text-red-400"
          disabled={props.isBusy}
          aria-label={translate(
            'auto.components.settings.RuntimeEnvironmentsPane.aeb26635d2',
            'Remove {{value0}}',
            { value0: environment.name }
          )}
        >
          {props.removingId === environment.id ? (
            <LoadingIndicator className="size-3" />
          ) : (
            <Trash2 className="size-3" />
          )}
        </Button>
      </div>
    </div>
  )
}

function RuntimeEnvironmentUpdate({
  entry
}: {
  entry: RemoteServerUpdateEntry
}): React.JSX.Element {
  return (
    <>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-[11px]">
          {entry.currentVersion
            ? translate(
                'auto.components.settings.RuntimeEnvironmentsPane.yiruVersion',
                'Yiru v{{value0}}',
                { value0: entry.currentVersion }
              )
            : translate(
                'auto.components.settings.RuntimeEnvironmentsPane.versionUnavailable',
                'Yiru version unavailable'
              )}
        </span>
        <RemoteServerUpdateStatus entry={entry} compact />
      </div>
      {entry.phase === 'manual' ? (
        <p className="text-muted-foreground mt-1 text-xs">
          {getRemoteServerManualUpdateHelp(entry)}
        </p>
      ) : null}
      {entry.phase === 'failed' && entry.error ? (
        <p className="text-destructive mt-1 text-xs">{entry.error}</p>
      ) : null}
    </>
  )
}
